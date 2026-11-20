import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Project } from "ts-morph";
import { ClassGraph, renderExplorerView } from "../classDiagram/ClassExplorer";
import {
  analyze,
  DetailLevel,
  formatType,
  generateClassDiagram,
  GenerationCancelledError,
  loadFolder,
} from "../classDiagram/ClassDiagramGenerator";

/**
 * Golden examples: every folder in test-files/class-diagram is a TypeScript
 * example with the diagrams it should produce. They double as a gallery; see
 * test-files/class-diagram/README.md.
 *
 * - expected.mmd: the default output for the folder (always required)
 * - golden.json (optional): more variants, e.g.
 *     { "variants": { "expected-public.mmd": { "detail": "public" } } }
 *   Options: detail ("full" | "public" | "names"), groupByFolder (true),
 *   focus (a file path relative to the example), includeTestFiles (true),
 *   explore (start file) with clicks (class ids lit in order): an explorer view.
 *
 * On a mismatch the actual output is written next to the expectation
 * (expected-x.mmd -> actual-x.mmd) for diffing or previewing. Run with
 * UPDATE_GOLDENS=1 to accept new output after an intended change.
 */
const EXAMPLES_DIR = path.resolve(__dirname, "../../test-files/class-diagram");
const UPDATE = process.env.UPDATE_GOLDENS === "1";

interface VariantOptions {
  detail?: DetailLevel;
  groupByFolder?: boolean;
  focus?: string;
  includeTestFiles?: boolean;
  explore?: string;
  clicks?: string[];
}

function variantsOf(folder: string): [string, VariantOptions][] {
  const configPath = path.join(folder, "golden.json");
  const extra: Record<string, VariantOptions> = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, "utf8")).variants ?? {}
    : {};
  return [["expected.mmd", {}], ...Object.entries(extra)];
}

async function generateVariant(folder: string, options: VariantOptions): Promise<string> {
  if (options.explore) {
    const start = path.join(folder, options.explore);
    const { sourceFiles } = loadFolder(folder, { alwaysInclude: [start] });
    const graph = new ClassGraph(await analyze(sourceFiles), folder);
    const origin = graph.idsInFile(start, (a, b) => path.resolve(a) === path.resolve(b));
    return renderExplorerView(graph, { origin, lit: [...origin, ...(options.clicks ?? [])] }).mermaid;
  }
  const focus = options.focus ? [path.join(folder, options.focus)] : undefined;
  const { sourceFiles } = loadFolder(folder, { includeTestFiles: options.includeTestFiles, alwaysInclude: focus });
  return generateClassDiagram(sourceFiles, {
    detail: options.detail,
    groupByFolderFrom: options.groupByFolder ? folder : undefined,
    focusFiles: focus,
  });
}

suite("Class diagram examples (goldens)", () => {
  const examples = fs
    .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  test("examples folder is not empty", () => {
    assert.ok(examples.length > 0, `no examples found in ${EXAMPLES_DIR}`);
  });

  for (const example of examples) {
    const folder = path.join(EXAMPLES_DIR, example);
    for (const [expectedName, options] of variantsOf(folder)) {
      test(`${example}/${expectedName}`, async function () {
        this.timeout(30000);
        const expectedPath = path.join(folder, expectedName);
        assert.ok(/^expected.*\.mmd$/.test(expectedName), `variant names must be expected*.mmd: ${expectedName}`);
        const actualPath = path.join(folder, expectedName.replace(/^expected/, "actual"));
        const actual = await generateVariant(folder, options);

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
        // Missing or different: leave the actual output to look at.
        fs.writeFileSync(actualPath, actual);
        assert.ok(expected !== undefined, `missing ${expectedPath}; output written to ${actualPath} (accept with UPDATE_GOLDENS=1)`);
        assert.strictEqual(actual, expected, `${example}: output differs; see ${actualPath}`);
      });
    }
  }
});

function diagramFor(code: string): Promise<string> {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile("/src/Example.ts", code);
  return generateClassDiagram(project.getSourceFiles());
}

function line(diagram: string, fragment: string): string {
  const found = diagram.split("\n").find((l) => l.includes(fragment));
  assert.ok(found, `no line containing "${fragment}" in:\n${diagram}`);
  return found;
}

suite("Class diagram generator", () => {
  test("parameters show names only: no types, defaults or destructuring braces", async () => {
    const diagram = await diagramFor(`
      class Example {
        foo(a = 1, b: string = "bar", c = { x: 1 }) {}
        setInfo({ name, age, birthdate }: { name: string; age: number; birthdate: Date }) {}
        both([first, second]: number[], ...rest: string[]) {}
      }
    `);
    assert.strictEqual(line(diagram, "+foo(").trim(), "+foo(a, b, c) void");
    assert.strictEqual(line(diagram, "+setInfo(").trim(), "+setInfo(name, age, birthdate) void");
    assert.strictEqual(line(diagram, "+both(").trim(), "+both(first, second, ...rest) void");
  });

  test("handles a large destructured options parameter with defaults (user-reported)", async () => {
    const diagram = await diagramFor(`
      import { z } from "zod";
      interface LLMClient {}
      class StagehandExtractHandler {
        public async extract<T extends z.AnyZodObject>({
          instruction, schema, content = {}, llmClient, requestId,
          domSettleTimeoutMs, useTextExtract = false, selector,
        }: {
          instruction?: string; schema?: T; content?: z.infer<T>; llmClient?: LLMClient;
          requestId?: string; domSettleTimeoutMs?: number; useTextExtract?: boolean; selector?: string;
        } = {}): Promise<z.infer<T>> {
          return {} as z.infer<T>;
        }
      }
    `);
    const extract = line(diagram, "+extract(");
    assert.ok(
      extract.includes(
        "(instruction, schema, content, llmClient, requestId, domSettleTimeoutMs, useTextExtract, selector)"
      ),
      extract
    );
    assert.ok(!/[{}=]/.test(extract), extract);
  });

  test("method return types use Mermaid syntax `name() Type` (no doubled colon)", async () => {
    const diagram = await diagramFor(`
      class A {
        a(): number { return 1; }
        b() { return "x"; }
      }
    `);
    assert.strictEqual(line(diagram, "+a(").trim(), "+a() number");
    assert.strictEqual(line(diagram, "+b(").trim(), "+b() string");
    assert.ok(!diagram.includes("): "), diagram);
  });

  test("relationships are matched by declaration, through generics and unions", async () => {
    const diagram = await diagramFor(`
      class Item {}
      class Owner {}
      class Box {
        items: Map<string, Item[]>;
        owner: Promise<Owner> | undefined;
      }
    `);
    assert.ok(diagram.includes("  Box --> Item : items"), diagram);
    assert.ok(diagram.includes("  Box --> Owner : owner"), diagram);
  });

  test("cancellation stops generation", async () => {
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/a.ts", "export class A {}");
    await assert.rejects(
      generateClassDiagram(project.getSourceFiles(), { isCancelled: () => true }),
      GenerationCancelledError
    );
  });

  test("works without a tsconfig.json (fixed fallback compiler options)", async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "class-diagram-"));
    try {
      fs.writeFileSync(path.join(folder, "a.ts"), "export class A { b?: B }\nexport class B {}\n");
      const { sourceFiles, tsConfigFilePath } = loadFolder(folder);
      if (tsConfigFilePath) {
        // A tsconfig.json somewhere above the temp folder; the fallback path
        // can't be exercised on this machine.
        return;
      }
      const diagram = await generateClassDiagram(sourceFiles);
      assert.ok(diagram.includes("+b?: B"), diagram);
      assert.ok(diagram.includes("A --> B : b"), diagram);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  test("uses tsconfig.base.json (monorepo root) when there is no tsconfig.json", async () => {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "class-diagram-"));
    try {
      fs.writeFileSync(
        path.join(folder, "tsconfig.base.json"),
        JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@lib/*": ["lib/*"] } } })
      );
      fs.mkdirSync(path.join(folder, "lib"));
      fs.writeFileSync(path.join(folder, "lib", "b.ts"), "export class B {}\n");
      fs.writeFileSync(path.join(folder, "a.ts"), 'import { B } from "@lib/b";\nexport class A { b: B }\n');
      const { sourceFiles, tsConfigFilePath } = loadFolder(folder);
      assert.strictEqual(tsConfigFilePath, path.join(folder, "tsconfig.base.json"));
      const diagram = await generateClassDiagram(sourceFiles);
      assert.ok(diagram.includes("A --> B : b"), diagram);
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  });

  test("formatType keeps Mermaid-safe text", () => {
    assert.strictEqual(formatType("(a: string) => void"), "Function");
    assert.strictEqual(formatType("{ a: number }"), "object");
    assert.strictEqual(formatType('import("/x/y").User'), "User");
    assert.strictEqual(formatType("Map<string, Array<User>>"), "Map&lt;string, Array&lt;User&gt;&gt;");
    assert.strictEqual(formatType("A & B"), "A &amp; B");
  });
});
