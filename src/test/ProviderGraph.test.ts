import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { analyze, loadFolder } from "../classDiagram/ClassDiagramGenerator";
import { ClassGraph, renderExplorerView } from "../classDiagram/ClassExplorer";
import { recordAnswers } from "../probe/recordAnswers";
import { WithReferenceConsumers } from "../classDiagram/ReferenceConsumers";
import { Loc, Pos, ProviderGraph, Providers } from "../classDiagram/ProviderGraph";
import { flattenNested, signature } from "../packs/languages/members";

/**
 * Explorer goldens answered by a language extension. Each
 * `test-files/explorer/<name>.views/` holds `views.json` (walks: a start file
 * and the classes lit after it), `answers.json` (the language server's
 * answers, recorded with scripts/record-provider-answers.js) and the expected
 * Mermaid per walk. Replaying keeps the tests free of gopls.
 *
 * With `"compare": true` (TypeScript), every walk is also rendered by our own
 * TypeScript analysis (ClassGraph) as `expected-x.ours.mmd`, and by our
 * analysis with "in" from every reference (classDiagram.explorerConsumers:
 * "references") as `expected-x.ours-references.mmd`, so the sources can be
 * compared on the same code.
 *
 * On a mismatch the output is written next to the expectation
 * (expected-x.mmd -> actual-x.mmd). Run with UPDATE_GOLDENS=1 to accept.
 *
 * RECORD_ANSWERS=<name>[,<name>] records `<name>.views/answers.json` first,
 * through the language extensions in the test host (only the built-in ones,
 * i.e. TypeScript; other languages are recorded with the dev command).
 */
const EXPLORER = path.resolve(__dirname, "../../test-files/explorer");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

/** Providers answering from a recording; questions not in it are collected in `missing`. */
function replay(root: string, answers: Record<string, any>, missing: string[]): Providers {
  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const at = (file: string, pos: Pos) => `${rel(file)}:${pos.line}:${pos.character}`;
  const abs = (locs: Loc[]) => locs.map((l) => ({ ...l, file: path.isAbsolute(l.file) ? l.file : path.join(root, l.file) }));
  const answer = (key: string) => {
    if (!(key in answers)) {
      missing.push(key);
      throw new Error(`not recorded: ${key}`);
    }
    const value = answers[key];
    if (value?.error) {
      throw new Error(value.error);
    }
    return value?.undefined ? undefined : value;
  };
  return {
    documentSymbols: async (file) => answer(`documentSymbols ${rel(file)}`),
    supertypes: async (file, pos) => {
      const locs = answer(`supertypes ${at(file, pos)}`);
      return locs && abs(locs);
    },
    subtypes: async (file, pos) => {
      const locs = answer(`subtypes ${at(file, pos)}`);
      return locs && abs(locs);
    },
    implementations: async (file, pos) => abs(answer(`implementations ${at(file, pos)}`)),
    typeDefinition: async (file, pos) => abs(answer(`typeDefinition ${at(file, pos)}`)),
    definition: async (file, pos) => abs(answer(`definition ${at(file, pos)}`)),
    // The example's files are on disk; their text is not part of the recording.
    text: async (file) => fs.readFileSync(file, "utf8"),
    references: async (file, pos) => abs(answer(`references ${at(file, pos)}`)),
    siblings: async (file) => answer(`siblings ${rel(path.dirname(file)) || "."}`).map((f: string) => path.join(root, f)),
  };
}

/** Writes `actual` or compares it with `expectedPath` (golden rules above). */
function golden(expectedPath: string, actual: string, label: string) {
  const actualPath = expectedPath.replace(/expected([^/\\]*)$/, "actual$1");
  if (UPDATE) {
    fs.writeFileSync(expectedPath, actual);
    fs.rmSync(actualPath, { force: true });
    return;
  }
  const expected = fs.existsSync(expectedPath) ? fs.readFileSync(expectedPath, "utf8") : undefined;
  if (actual === expected) {
    fs.rmSync(actualPath, { force: true });
    return;
  }
  fs.writeFileSync(actualPath, actual);
  assert.ok(expected !== undefined, `missing ${expectedPath}; output written to ${actualPath} (accept with UPDATE_GOLDENS=1)`);
  assert.strictEqual(actual, expected, `${label}: output differs; see ${actualPath}`);
}

const toRecord = (process.env.RECORD_ANSWERS ?? "").split(",").filter(Boolean);
if (toRecord.length) {
  suite("Recording language extension answers (RECORD_ANSWERS)", () => {
    for (const name of toRecord) {
      test(`records ${name}`, async function () {
        this.timeout(300000);
        const summary = await recordAnswers(vscode.Uri.file(path.join(EXPLORER, `${name}.views`, "views.json")), { quiet: true });
        console.log(summary);
        assert.ok(summary && !summary.includes("NOT REACHED"), summary);
      });
    }
  });
}

suite("Explorer from language extensions (goldens)", () => {
  const sets = fs.existsSync(EXPLORER) ? fs.readdirSync(EXPLORER).filter((n) => n.endsWith(".views")).sort() : [];

  test("explorer examples exist", () => {
    assert.ok(sets.length > 0, `no *.views folders in ${EXPLORER}`);
  });

  for (const set of sets) {
    const dir = path.join(EXPLORER, set);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "views.json"), "utf8"));
    const root = path.resolve(dir, config.example);
    const answersPath = path.join(dir, config.answers);
    if (!fs.existsSync(answersPath)) {
      // Recorded with "Mermaid (spike): Record Explorer Answers" once the language extension is installed.
      test(`${set}: not recorded yet (${config.answers} missing)`, function () {
        this.skip();
      });
      continue;
    }
    const answers = JSON.parse(fs.readFileSync(answersPath, "utf8"));
    for (const [expectedName, walk] of Object.entries<{ start: string; light: string[] }>(config.views)) {
      test(`${set}/${expectedName}`, async () => {
        assert.ok(/^expected.*\.mmd$/.test(expectedName), `view names must be expected*.mmd: ${expectedName}`);
        const missing: string[] = [];
        const graph = new ProviderGraph(replay(root, answers, missing), {
          root,
          inWorkspace: (f) => f.startsWith(root + path.sep),
          includeTestFiles: false,
        });
        const origin = await graph.start(path.join(root, walk.start));
        for (const id of [...origin, ...walk.light]) {
          await graph.expand(id);
        }
        assert.deepStrictEqual(missing, [], "questions not in answers.json: re-record with scripts/record-provider-answers.js");
        for (const id of walk.light) {
          assert.ok(graph.has(id), `${id} is not reachable in this walk`);
        }
        const actual = renderExplorerView(graph, { lit: [...origin, ...walk.light], origin }).mermaid;
        golden(path.join(dir, expectedName), actual, set);
      });
      if (config.compare) {
        test(`${set}/${expectedName.replace(/\.mmd$/, ".ours.mmd")} (our TypeScript analysis)`, async function () {
          this.timeout(60000);
          const graph = new ClassGraph(await analyze(loadFolder(root).sourceFiles), root);
          const origin = graph.idsInFile(path.join(root, walk.start), (a, b) => path.resolve(a) === path.resolve(b));
          const actual = renderExplorerView(graph, { lit: [...origin, ...walk.light], origin }).mermaid;
          golden(path.join(dir, expectedName.replace(/\.mmd$/, ".ours.mmd")), actual, `${set} (ours)`);
        });
        test(`${set}/${expectedName.replace(/\.mmd$/, ".ours-references.mmd")} (ours, in from every reference)`, async function () {
          this.timeout(60000);
          const missing: string[] = [];
          const base = new ClassGraph(await analyze(loadFolder(root).sourceFiles), root);
          const graph = new WithReferenceConsumers(base, replay(root, answers, missing), (f) => f.startsWith(root + path.sep));
          const origin = base.idsInFile(path.join(root, walk.start), (a, b) => path.resolve(a) === path.resolve(b));
          for (const id of [...origin, ...walk.light]) {
            await graph.expand(id);
          }
          assert.deepStrictEqual(missing, [], "questions not in answers.json: re-record (RECORD_ANSWERS)");
          const actual = renderExplorerView(graph, { lit: [...origin, ...walk.light], origin }).mermaid;
          golden(path.join(dir, expectedName.replace(/\.mmd$/, ".ours-references.mmd")), actual, `${set} (ours, references)`);
        });
      }
    }
  }
});

suite("ProviderGraph Go rules", () => {
  test("signature: parameter names only, result tuple without parentheses", () => {
    assert.strictEqual(signature("func(order *Order, id string) (Money, error)"), "(order, id) Money, error");
    assert.strictEqual(signature("func(a, b int) bool"), "(a, b) bool");
    assert.strictEqual(signature("func(int, string)"), "(int, string)");
    assert.strictEqual(signature("func()"), "()");
    assert.strictEqual(signature("func(handler func(int) error) func() error"), "(handler) func… error");
    assert.strictEqual(signature(undefined), "()");
  });

  test("signature outside Go: parameter names from any `(…)` in the detail", () => {
    assert.strictEqual(signature("void Order.Add(Line line, int count = 1)", false), "(line, count)");
    assert.strictEqual(signature("function add(Line $line, ?int $n = null): void", false), "($line, $n)");
    assert.strictEqual(signature("Orders.Shop.Status", false), "()");
  });

  test("flattenNested keeps Mermaid member lines parseable", () => {
    assert.strictEqual(flattenNested("map[string]*Order"), "map[string]*Order");
    assert.strictEqual(flattenNested("func(int) error"), "func… error");
    assert.strictEqual(flattenNested("struct{ a int }"), "struct…");
  });
});

/** A barrel answered by a fake language extension: the engine starts from what it re-exports. */
suite("ProviderGraph: barrels", () => {
  const root = path.join(path.sep, "work", "shop");
  const span = (l: number, c: number, l2: number, c2: number) => ({ start: { line: l, character: c }, end: { line: l2, character: c2 } });
  const cls = (name: string, line: number) => ({ name, kind: "Class", range: span(line, 0, line + 2, 0), selectionRange: span(line, 6, line, 6 + name.length), children: [] });
  const files: Record<string, { text: string; symbols: any[] }> = {
    "__init__.py": { text: "# the package's API\nfrom .order import Order, Line as L\nfrom .store import *\n", symbols: [] },
    "order.py": { text: "class Order:\n  pass\n\nclass Line:\n  pass\n", symbols: [cls("Order", 0), cls("Line", 3)] },
    "store.py": { text: "class Store:\n  pass\n\nclass MemStore(Store):\n  pass\n", symbols: [cls("Store", 0), cls("MemStore", 3)] },
    "util.py": { text: "def helper():\n  pass\n", symbols: [{ name: "helper", kind: "Function", range: span(0, 0, 1, 6), selectionRange: span(0, 4, 0, 10), children: [] }] },
  };
  const file = (name: string) => path.join(root, name);
  const asked: string[] = [];
  const providers: Providers = {
    documentSymbols: async (f) => files[path.basename(f)]?.symbols ?? [],
    supertypes: async () => [],
    subtypes: async () => [],
    implementations: async () => [],
    typeDefinition: async () => [],
    references: async () => [],
    siblings: async () => Object.keys(files).map(file),
    text: async (f) => files[path.basename(f)]?.text ?? "",
    definition: async (f, at) => {
      asked.push(`${path.basename(f)}:${at.line}:${at.character}`);
      const key = `${at.line}:${at.character}`;
      // line 1: `Order` at 19, `Line` at 26; line 2: the module `store` at 6.
      return (
        {
          "1:19": [{ file: file("order.py"), range: span(0, 6, 0, 11) }],
          "1:26": [{ file: file("order.py"), range: span(3, 6, 3, 10) }],
          "2:6": [{ file: file("store.py"), range: span(0, 0, 0, 0) }],
        } as Record<string, Loc[]>
      )[key] ?? [];
    },
  };

  test("names and whole modules re-exported by __init__.py become the start", async () => {
    const graph = new ProviderGraph(providers, { root, inWorkspace: (f) => f.startsWith(root), includeTestFiles: false, source: "fake" });
    const origin = await graph.start(file("__init__.py"));
    assert.deepStrictEqual(asked, ["__init__.py:1:19", "__init__.py:1:26", "__init__.py:2:6"], "asked where the pack points");
    assert.deepStrictEqual(origin.map((id) => graph.name(id)).sort(), ["Line", "MemStore", "Order", "Store"]);
    assert.ok(origin.every((id) => graph.location(id)!.file !== file("__init__.py")));
  });

  test("a file with only functions still starts from its functions", async () => {
    const graph = new ProviderGraph(providers, { root, inWorkspace: (f) => f.startsWith(root), includeTestFiles: false, source: "fake" });
    assert.deepStrictEqual((await graph.start(file("util.py"))).map((id) => graph.name(id)), ["helper"]);
  });
});
