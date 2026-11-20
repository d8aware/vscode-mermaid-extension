import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ECOSYSTEM_PACKS, LANGUAGE_PACKS, languagePackFor, MARKER_RULES, rulesFor } from "../packs";
import { cargo, readRustImports } from "../packs/ecosystems/cargo";
import { composer } from "../packs/ecosystems/composer";
import { dotnet } from "../packs/ecosystems/dotnet";
import { parseToml, stripCLike } from "../packs/ecosystems/formats";
import { jvm } from "../packs/ecosystems/jvm";
import { javascript } from "../packs/ecosystems/javascript";
import { normalizePypi, python, readPythonImports } from "../packs/ecosystems/python";
import type { CodeContext } from "../packs/types";

const REPO = path.resolve(__dirname, "../..");

/**
 * The plug-in design: language and ecosystem rules live in packs (src/packs);
 * the engines only ask packs. These tests keep it that way.
 */
suite("Language and ecosystem packs", () => {
  test("the engines name no language or ecosystem", () => {
    // A language's rules belong in its pack; the engines must stay universal.
    const engines = ["src/classDiagram/ProviderGraph.ts", "src/landscape/scan.ts", "src/landscape/view.ts", "src/landscape/project.ts"];
    const specific = /["'`/]\.?(go|cs|php|py|rb|java)\b["'`]|package\.json|composer\.json|go\.mod|\.csproj|tsconfig|\bisGo\b|\bpython\b/;
    for (const file of engines) {
      const code = fs
        .readFileSync(path.join(REPO, file), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      const hit = specific.exec(code);
      assert.ok(!hit, `${file} mentions "${hit?.[0]}": move it into a pack`);
    }
  });

  test("committed recordings name no machine: files are relative or /external/<folder>/<name>", () => {
    // The repository is public; a recorded absolute path would show the recorder's user and setup.
    const dir = path.join(REPO, "test-files/explorer");
    for (const views of fs.readdirSync(dir).filter((d) => d.endsWith(".views"))) {
      const file = path.join(dir, views, "answers.json");
      if (!fs.existsSync(file)) {
        continue;
      }
      for (const [, p] of fs.readFileSync(file, "utf8").matchAll(/"file":\s*"([^"]*)"/g)) {
        assert.ok(!/^([A-Za-z]:|\/)/.test(p) || /^\/external\/[^/]+\/[^/]+$/.test(p), `${views}/answers.json: ${p}`);
      }
    }
  });

  test("every language pack's files are offered Explore Classes From Here", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
    const whens: string[] = Object.values<{ command: string; when?: string }[]>(manifest.contributes.menus)
      .flat()
      .filter((m) => m.command === "vscode-mermaid-extension.exploreClasses")
      .map((m) => m.when ?? "");
    assert.ok(whens.length >= 3, "explorer, editor and palette menus");
    for (const when of whens) {
      const listed = /resourceExtname =~ \/\^\\\.\(([^)]+)\)\$\//.exec(when)?.[1].split("|") ?? [];
      for (const pack of LANGUAGE_PACKS) {
        for (const ext of pack.extensions) {
          assert.ok(listed.includes(ext.slice(1)), `${ext} (${pack.label}) missing from a menu "when": ${when}`);
        }
      }
    }
  });

  test("files resolve to their pack; unknown files get the generic rules", () => {
    assert.strictEqual(languagePackFor("a/b.go")?.id, "go");
    assert.strictEqual(languagePackFor("a/B.CS")?.id, "csharp");
    assert.strictEqual(languagePackFor("a/b.tsx")?.id, "typescript");
    assert.strictEqual(languagePackFor("a/b.java")?.id, "java");
    assert.strictEqual(languagePackFor("a/b.rs")?.id, "rust");
    assert.strictEqual(languagePackFor("a/b.swift")?.id, "generic");
    assert.ok(rulesFor("x.java").testFile?.test("OrderTest.java") && !rulesFor("x.java").testFile?.test("Order.java"));
    assert.strictEqual(languagePackFor("a/b.txt"), undefined);
    assert.strictEqual(rulesFor("a/b.txt").id, "generic");
  });

  test("marker priorities are unique and every marker belongs to one pack", () => {
    const priorities = MARKER_RULES.map((m) => m.priority);
    assert.strictEqual(new Set(priorities).size, priorities.length, "two markers share a priority");
    assert.strictEqual(MARKER_RULES.length, ECOSYSTEM_PACKS.flatMap((p) => p.markers).length);
  });

  test("Rust impl blocks are declared apart from their type", () => {
    const apart = rulesFor("x.rs").apart!;
    assert.deepStrictEqual(apart("impl Order"), { type: "Order", supertypes: [] });
    assert.deepStrictEqual(apart("impl Entity for Order"), { type: "Order", supertypes: ["Entity"] });
    assert.deepStrictEqual(apart("impl<T: Clone> crate::shop::Store<T> for MemStore<T>"), { type: "MemStore", supertypes: ["Store"] });
    assert.strictEqual(apart("impl !Send for Order"), undefined);
    assert.strictEqual(apart("Order"), undefined);
  });

  test("Python visibility follows its naming rules", () => {
    const sym = (name: string) => ({ name, kind: "Variable", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, selectionRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, children: [] });
    const member = (name: string) => rulesFor("x.py").member(sym(name), false);
    assert.deepStrictEqual(["total", "_status", "__secret", "__init__"].map(member), ["+total", "#_status", "-__secret", "+__init__"]);
  });

  test("Go receivers, Python and C# headers are pack data", () => {
    assert.deepStrictEqual(rulesFor("x.go").receiver?.("(*MemStore).Save"), { type: "MemStore", method: "Save" });
    assert.strictEqual(rulesFor("x.go").header, undefined, "Go declares no inheritance in headers");
    assert.deepStrictEqual(rulesFor("x.py").header, { opens: ":", baseDepth: 1 });
    assert.ok(rulesFor("x.cs").header?.cut?.test("Base where T : IFoo"));
  });
});

suite("Pack readers", () => {
  test("TOML: tables, arrays of tables, dotted and quoted keys, inline tables, comments", () => {
    const doc = parseToml(
      [
        '[project]',
        'name = "acme-x" # trailing comment',
        'dependencies = [',
        '  "requests>=2", # inside an array',
        "  'attrs',",
        ']',
        '[tool.setuptools.package-dir]',
        '"" = "src"',
        '[dependencies]',
        'core = { path = "../core", features = ["a"] }',
        'a.b = 1',
        '[[bin]]',
        'name = "one"',
        '[[bin]]',
        'name = "two"',
      ].join("\n")
    );
    assert.deepStrictEqual(doc.project, { name: "acme-x", dependencies: ["requests>=2", "attrs"] });
    assert.deepStrictEqual((doc.tool as any).setuptools["package-dir"], { "": "src" });
    assert.deepStrictEqual(doc.dependencies, { core: { path: "../core", features: ["a"] }, a: { b: 1 } });
    assert.deepStrictEqual(doc.bin, [{ name: "one" }, { name: "two" }]);
    assert.throws(() => parseToml('name = "unterminated'));
  });

  test("comments and strings do not count in C-like sources", () => {
    assert.strictEqual(stripCLike('a // b\n/* c\n d */ e "f // g" h'), 'a \n\n e "" h');
  });

  test("Python imports: absolute, from, relative, parenthesised; comments ignored", () => {
    const text = ["import os, a.b as c", "from .x import (y,", "  z)", "from .. import w", "from p.q import *", "# import nope"].join("\n");
    assert.deepStrictEqual(readPythonImports(text), ["os", "a.b", ".x.y", ".x.z", "..w", "p.q"]);
    assert.strictEqual(normalizePypi("Acme_Analytics.Core"), "acme-analytics-core");
  });

  test("Rust: mod declarations and use paths", () => {
    const text = "mod a;\npub mod b;\nmod inline { }\nuse crate::x::{y, z};\nuse super::q as r;\n// mod no;";
    assert.deepStrictEqual(readRustImports(text), ["mod:a", "mod:b", "use:crate::x", "use:super::q"]);
    assert.deepStrictEqual(cargo.imports!.read("use other_crate::thing;\nuse crate::own;\nuse std::fmt;\nextern crate legacy;"), [
      "other_crate",
      "legacy",
    ]);
  });

  test("C#: using directives, namespaces, entries", () => {
    const rule = dotnet.code![0];
    assert.deepStrictEqual(rule.read("global using A.B;\nusing static C.D;\nusing E = F.G;\nusing (var x = y) {}"), ["A.B", "C.D", "F.G"]);
    assert.deepStrictEqual(rule.declares!("namespace A.B;\nnamespace C { }"), ["A.B", "C"]);
    assert.strictEqual(rule.entry!("using X;\nvar app = 1;", "Program.cs"), "top-level statements");
    assert.strictEqual(rule.entry!("namespace N;\nclass P { static async Task Main(string[] a) {} }", "P.cs"), "static Main method");
    assert.strictEqual(rule.entry!("namespace N;\n[Attr]\npublic class P {}", "P.cs"), undefined);
  });

  test("PHP: use statements (grouped, aliased, functions) and literal includes", () => {
    const rule = composer.code![0];
    assert.deepStrictEqual(rule.read("<?php\nuse \\A\\B;\nuse C\\{D, E as F};\nuse function G\\h;\nrequire_once 'lib/x.php';\n// use Nope;"), [
      "A\\B",
      "C\\D",
      "C\\E",
      "G\\h",
      "file:lib/x.php",
    ]);
  });

  test("barrels: where Python __init__.py and Rust pub use / pub mod name what they re-export", () => {
    const py = rulesFor("x.py").reexports!;
    const init = "# api\nfrom .order import Order, Line as L  # names\nfrom .store import *\nfrom . import util\nfrom shop.models import (\n    Customer,\n)\nimport os\n";
    assert.deepStrictEqual(py(init, "shop/__init__.py"), [
      { line: 1, character: 19 },
      { line: 1, character: 26 },
      { line: 2, character: 6, all: true },
      { line: 3, character: 14 },
      { line: 5, character: 4 },
    ]);
    assert.deepStrictEqual(py(init, "shop/views.py"), [], "only a package's __init__.py is a barrel");

    const rs = rulesFor("x.rs").reexports!;
    const lib = "pub mod shop;\nmod private;\n// pub use gone::X;\npub use shop::{Order, store::Store as S, self};\npub(crate) use storage::*;\nuse std::fmt;\npub use money::Money;\n";
    assert.deepStrictEqual(rs(lib, "src/lib.rs"), [
      { line: 0, character: 8, all: true },
      { line: 3, character: 15 },
      { line: 3, character: 29 },
      { line: 4, character: 15, all: true },
      { line: 6, character: 15 },
    ]);
    assert.strictEqual(rulesFor("x.go").reexports, undefined, "Go has no barrels: a package is the unit");
  });

  test("Java and Kotlin: imports, packages, main", () => {
    const rule = jvm.code![0];
    assert.deepStrictEqual(rule.read("package a.b;\nimport c.D;\nimport static e.F.g;\nimport h.*;\nimport k.L as M"), ["c.D", "e.F.g", "h", "k.L"]);
    assert.deepStrictEqual(rule.declares!("package a.b;"), ["a.b"]);
    assert.strictEqual(rule.entry!("fun main() {}", "Main.kt"), "main method");
  });
});

/** Pack readers on small throwaway projects: forms the example repository does not use. */
suite("Pack readers on project files", () => {
  let dir: string;
  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-readers-"));
  });
  teardown(() => fs.rmSync(dir, { recursive: true, force: true }));

  const write = (files: Record<string, string>) => {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return Object.keys(files).filter((f) => !f.includes("/"));
  };
  const context = (facts: CodeContext["facts"] = []): CodeContext => ({
    dir,
    facts,
    alias: () => undefined,
    isFile: (f) => fs.existsSync(f) && fs.statSync(f).isFile(),
    isDir: (f) => fs.existsSync(f) && fs.statSync(f).isDirectory(),
  });
  const rel = (f: string | undefined) => f && path.relative(dir, f).split(path.sep).join("/");

  test("requirements.txt: names normalised; comments, options and blank lines skipped", () => {
    const files = write({ "requirements.txt": "# pinned\nDjango==5.1  # web\n\n-r base.txt\n--index-url https://example.invalid\nzope.interface>=6\nrequests[socks]\n" });
    assert.deepStrictEqual(python.readProject(dir, files).dependencies?.map((d) => d.name), ["django", "zope-interface", "requests"]);
  });

  test("pyproject: optional and Poetry dependencies, path dependencies, package-dir, scripts", () => {
    const files = write({
      "pyproject.toml": [
        "[project]",
        'name = "Acme_Tools"',
        'dependencies = ["attrs>=23"]',
        "[project.optional-dependencies]",
        'dev = ["pytest"]',
        "[project.scripts]",
        'acme = "acme.cli:main"',
        "[tool.poetry.dependencies]",
        'python = "^3.12"',
        'httpx = "*"',
        'shared = { path = "../shared" }',
        "[tool.setuptools.package-dir]",
        '"" = "lib"',
      ].join("\n"),
      "lib/acme/cli.py": "",
    });
    const facts = python.readProject(dir, files);
    assert.deepStrictEqual(facts.names, [{ namespace: "pypi", name: "acme-tools", source: "pyproject.toml name" }]);
    assert.deepStrictEqual(facts.dependencies?.map((d) => d.name), ["attrs", "pytest", "httpx"]);
    assert.deepStrictEqual(facts.paths, [{ path: path.resolve(dir, "../shared"), rule: "pyproject.toml path dependency" }]);
    assert.deepStrictEqual(facts.sourceRoots?.map((r) => rel(r.dir)), ["lib"]);
    assert.deepStrictEqual(facts.entries?.map((e) => rel(e.file)), ["lib/acme/cli.py"]);
  });

  test("a broken pyproject.toml gives no facts instead of failing", () => {
    const files = write({ "pyproject.toml": "[project\nname = " });
    assert.deepStrictEqual(python.readProject(dir, files), {});
  });

  test("Python imports resolve to modules, packages and namespace folders", () => {
    write({ "app/__init__.py": "", "app/models.py": "", "app/api/__init__.py": "", "app/ns/thing.py": "", "src/lib/util.py": "" });
    const rule = python.code![0];
    const from = path.join(dir, "app/api/views.py");
    const resolve = (spec: string) => rel(rule.resolve!(spec, from, context()));
    assert.strictEqual(resolve("app.models.Order"), "app/models.py", "a name inside a module");
    assert.strictEqual(resolve("app.api"), "app/api/__init__.py", "a package");
    assert.strictEqual(resolve("app.ns"), "app/ns", "a folder without __init__.py");
    assert.strictEqual(resolve("lib.util"), "src/lib/util.py", "the src layout");
    assert.strictEqual(resolve("..models"), "app/models.py", "relative, one package up");
    assert.strictEqual(resolve("."), "app/api", "relative, the package itself");
    assert.strictEqual(resolve("requests"), undefined, "not in the project");
  });

  test("package.json: bin as a map, exports conditions, module; a broken file is skipped", () => {
    let files = write({ "package.json": JSON.stringify({ name: "@acme/cli", bin: { acme: "bin/acme.js", ax: "bin/ax.js" }, module: "esm/index.js", exports: { ".": { import: "esm/index.js", require: "cjs/index.js" } } }) });
    assert.deepStrictEqual(javascript.readProject(dir, files).entries?.map((e) => [rel(e.file), e.rule]), [
      ["esm/index.js", "package.json module"],
      ["bin/acme.js", "package.json bin"],
      ["bin/ax.js", "package.json bin"],
      ["esm/index.js", "package.json exports"],
    ]);
    files = write({ "package.json": JSON.stringify({ name: "x", exports: "./main.js" }) });
    assert.deepStrictEqual(javascript.readProject(dir, files).entries?.map((e) => rel(e.file)), ["main.js"]);
    files = write({ "package.json": JSON.stringify({ name: "x", exports: { ".": { default: "./d.js" } } }) });
    assert.deepStrictEqual(javascript.readProject(dir, files).entries?.map((e) => rel(e.file)), ["d.js"]);
    files = write({ "package.json": "{ not json" });
    assert.deepStrictEqual(javascript.readProject(dir, files).entries, undefined);
  });

  test("tsconfig: aliases need paths; a broken or path-less tsconfig has none", () => {
    let files = write({ "tsconfig.json": '{ "compilerOptions": { "baseUrl": "src", "paths": { "@app/*": ["app/*"], "@none": [] } } }' });
    assert.deepStrictEqual([...(javascript.readProject(dir, files).aliases ?? [])].map(([a, t]) => [a, rel(t)]), [["@app", "src/app"]]);
    files = write({ "tsconfig.json": '{ "compilerOptions": { "strict": true } }' });
    assert.strictEqual(javascript.readProject(dir, files).aliases, undefined);
  });

  test("Nx project.json: a path missing everywhere stays relative to the project", () => {
    const files = write({ "project.json": JSON.stringify({ sourceRoot: "libs/gone/src", targets: { build: { options: { main: "libs/gone/src/index.ts" } } } }) });
    const facts = javascript.readProject(dir, files);
    assert.deepStrictEqual(facts.sourceRoots?.map((r) => rel(r.dir)), ["libs/gone/src"]);
    assert.deepStrictEqual(facts.entries?.map((e) => [rel(e.file), e.rule]), [["libs/gone/src/index.ts", "project.json build main"]]);
  });
});
