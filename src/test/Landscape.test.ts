import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { parseGoImports, parseGoMod, parseGoWork } from "../landscape/golang";
import { readProjectCode, renderProjectView } from "../landscape/project";
import { LandscapeModel, scanFolder } from "../landscape/scan";
import { renderLandscapeView } from "../landscape/view";

/**
 * Landscape golden examples. Each `test-files/landscape/<name>.views/` folder
 * holds a `views.json` ({ "example": "../<name>", "views": { "<expected file>":
 * "<folder inside the example>" }, "projects": { "<expected file>": "<project
 * folder>[:<folder inside it>]" } }) and the expected Mermaid for each view.
 * The expected files live outside the example so they are not scanned.
 *
 * On a mismatch the output is written next to the expectation
 * (expected-x.mmd -> actual-x.mmd). Run with UPDATE_GOLDENS=1 to accept.
 */
const LANDSCAPES = path.resolve(__dirname, "../../test-files/landscape");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

suite("Landscape examples (goldens)", () => {
  const sets = fs.readdirSync(LANDSCAPES).filter((name) => name.endsWith(".views")).sort();

  test("landscape examples exist", () => {
    assert.ok(sets.length > 0, `no *.views folders in ${LANDSCAPES}`);
  });

  for (const set of sets) {
    const dir = path.join(LANDSCAPES, set);
    const config = JSON.parse(fs.readFileSync(path.join(dir, "views.json"), "utf8"));
    const example = path.resolve(dir, config.example);
    const views: (readonly [string, (model: LandscapeModel) => Promise<string>])[] = [
      ...Object.entries<string>(config.views).map(
        ([name, container]) => [name, async (model: LandscapeModel) => renderLandscapeView(model, path.resolve(example, container)).mermaid] as const
      ),
      // "projects": { "<expected file>": "<project folder>[:<folder inside it>]" }; no folder: where the view opens.
      ...Object.entries<string>(config.projects ?? {}).map(
        ([name, spec]) =>
          [
            name,
            async (model: LandscapeModel) => {
              const [projectRel, folder] = spec.split(":");
              const project = model.projects.find((p) => p.rel === projectRel);
              assert.ok(project, `no project ${projectRel}`);
              const code = await readProjectCode(model, project);
              return renderProjectView(code, folder ? path.join(project.dir, folder) : code.start).mermaid;
            },
          ] as const
      ),
    ];
    for (const [expectedName, render] of views) {
      test(`${set}/${expectedName}`, async () => {
        assert.ok(/^expected.*\.mmd$/.test(expectedName), `view names must be expected*.mmd: ${expectedName}`);
        const actual = await render(await scanFolder(example));
        const expectedPath = path.join(dir, expectedName);
        const actualPath = path.join(dir, expectedName.replace(/^expected/, "actual"));
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
        assert.strictEqual(actual, expected, `${set}: output differs; see ${actualPath}`);
      });
    }
  }
});

suite("Landscape scanner", () => {
  const example = path.join(LANDSCAPES, "acme");

  test("finds projects by marker files and ignores dependency/build folders", async () => {
    const model = await scanFolder(example);
    const rels = model.projects.map((p) => p.rel);
    assert.ok(rels.includes("web") && rels.includes("platform/libs/util") && rels.includes("services/billing/src/Billing.Api"));
    assert.ok(!rels.some((r) => r.includes("node_modules")), "node_modules is ignored");
    assert.ok(!model.files.some((f) => f.path.includes(`${path.sep}dist${path.sep}`)), "dist is ignored");
    assert.strictEqual(model.projects.find((p) => p.rel === "web")!.kind, "Angular workspace");
  });

  test("arrows come only from declared references, each with its rule", async () => {
    const model = await scanFolder(example);
    const edge = (from: string, to: string, rule: string) =>
      model.edges.find((e) => e.from.rel === from && e.to.rel === to && e.rule === rule)?.count;
    assert.strictEqual(edge("web", "platform/libs/ui-kit", "import of a package name"), 2, "incl. a deep import; a commented-out import does not count");
    assert.strictEqual(edge("web", "platform/libs/util", "import of a tsconfig path alias"), 1);
    assert.strictEqual(edge("web", "platform/libs/ui-kit", "package.json dependency"), 1);
    assert.strictEqual(edge("services/billing/src/Billing.Api", "services/billing/src/Billing.Core", "<ProjectReference>"), 1);
    assert.strictEqual(edge("legacy", "legacy/lib/pdf", "composer.json require"), 1);
    assert.strictEqual(edge("gateway/server", "gateway/shared", "import of a Go module path"), 2, "a commented-out import and a string do not count");
    assert.strictEqual(edge("gateway/server", "gateway/shared", "go.mod require"), 1, "a module outside the repository gives no arrow");
    assert.strictEqual(edge("gateway/server", "gateway/shared", "go.mod replace with a local directory"), 1);
  });

  test("Go projects: go.work and go.mod markers, module path as the name", async () => {
    const model = await scanFolder(example);
    const project = (rel: string) => model.projects.find((p) => p.rel === rel)!;
    assert.strictEqual(project("gateway").kind, "Go workspace");
    assert.strictEqual(project("gateway/server").kind, "Go module");
    assert.strictEqual(project("gateway/server").name, "example.com/acme/gateway/server");
    assert.strictEqual(project("gateway/server").nameSource, "go.mod module");
  });
});

suite("Landscape scanner: duplicate names", () => {
  test("a name declared by several projects resolves to the closest one", async () => {
    const os = require("os");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "landscape-dup-"));
    const write = (rel: string, text: string) => {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    };
    try {
      // A module and a copy of it ("aaa" sorts first) both declare example.com/app.
      for (const top of ["aaa-copy", "app"]) {
        write(`${top}/go.mod`, "module example.com/app\n\nrequire example.com/app/lib v0.0.0\n");
        write(`${top}/main.go`, 'package main\n\nimport "example.com/app/lib/x"\n');
        write(`${top}/lib/go.mod`, "module example.com/app/lib\n");
        write(`${top}/lib/x/x.go`, 'package x\n\nimport "example.com/app/internal"\n');
      }
      const model = await scanFolder(root);
      const edges = model.edges.map((e) => `${e.from.rel} -> ${e.to.rel} (${e.rule})`);
      assert.deepStrictEqual(edges, [
        "aaa-copy/lib -> aaa-copy (import of a Go module path)",
        "aaa-copy -> aaa-copy/lib (go.mod require)",
        "aaa-copy -> aaa-copy/lib (import of a Go module path)",
        "app/lib -> app (import of a Go module path)",
        "app -> app/lib (go.mod require)",
        "app -> app/lib (import of a Go module path)",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

suite("Go readers", () => {
  test("parseGoImports follows the Go syntax only", () => {
    const src = [
      "/* package doc */",
      "package main // trailing",
      "",
      'import "a/one"',
      "import (",
      '  b "a/two"; . "a/three"',
      '  _ "a/four" /* "a/not-this" */',
      "  `a/raw`",
      '  // "a/commented"',
      ")",
      'import x "a/five"',
      "",
      'var s = "a/not-an-import"',
      'import "a/too-late"',
    ].join("\n");
    assert.deepStrictEqual(parseGoImports(src), ["a/one", "a/two", "a/three", "a/four", "a/raw", "a/five"]);
    assert.deepStrictEqual(parseGoImports('// no package clause\nimport "a"'), []);
  });

  test("parseGoMod reads module, require and local replace directives", () => {
    const mod = parseGoMod(
      [
        "module example.com/m // comment",
        "go 1.22",
        "require example.com/a v1.0.0",
        "require (",
        "  example.com/b v1.0.0 // indirect",
        ")",
        "replace example.com/a => ../a",
        "replace (",
        "  example.com/b v1.0.0 => example.com/fork v1.0.1",
        "  example.com/c => /abs/c",
        ")",
      ].join("\n")
    );
    assert.strictEqual(mod.module, "example.com/m");
    assert.deepStrictEqual(mod.require, ["example.com/a", "example.com/b"]);
    assert.deepStrictEqual(mod.localReplace, [
      { module: "example.com/a", dir: "../a" },
      { module: "example.com/c", dir: "/abs/c" },
    ]);
    assert.deepStrictEqual(parseGoWork("go 1.22\nuse ./x\nuse (\n  ./y\n  ../z\n)"), ["./x", "./y", "../z"]);
  });
});
