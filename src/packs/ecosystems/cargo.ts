/** Rust: Cargo packages and workspaces; `mod` and `use crate::` / `super::` / `self::` paths inside a crate. */
import * as fs from "fs";
import * as path from "path";
import type { CodeContext, EcosystemPack, ProjectFacts } from "../types";
import { parseToml, stripCLike, TomlTable, tomlTable } from "./formats";

/** In Rust code a package `foo-bar` is the crate `foo_bar`. */
const crateName = (name: string) => name.replace(/-/g, "_");

/** The folder a file's child modules live in (Rust reference, "Module source filenames"). */
function childDir(file: string): string {
  const base = path.basename(file);
  return base === "mod.rs" || base === "lib.rs" || base === "main.rs" ? path.dirname(file) : path.join(path.dirname(file), base.replace(/\.rs$/, ""));
}

function moduleFile(dir: string, name: string, context: CodeContext): string | undefined {
  return [path.join(dir, name + ".rs"), path.join(dir, name, "mod.rs")].find((f) => context.isFile(f));
}

/** Walks `a::b::c` down from a module folder; the deepest module file found. */
function walk(dir: string, segments: string[], context: CodeContext): string | undefined {
  let found: string | undefined;
  for (const segment of segments) {
    const file = moduleFile(dir, segment, context);
    if (!file) {
      break;
    }
    found = file;
    dir = childDir(file);
  }
  return found;
}

/** `mod x;` -> "mod:x"; `use crate::a::b::{c, d}` -> "use:crate::a::b" (the braces' items are not modules we can tell apart). */
export function readRustImports(text: string): string[] {
  const code = stripCLike(text);
  const out: string[] = [];
  for (const m of code.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z_]\w*)\s*;/gm)) {
    out.push("mod:" + m[1]);
  }
  for (const m of code.matchAll(/^\s*(?:pub(?:\([^)]*\))?\s+)?use\s+([^;]+);/gm)) {
    const head = m[1].split(/\s+as\s+/)[0].replace(/\s+/g, "").split("::{")[0];
    out.push("use:" + head.replace(/::\*$/, ""));
  }
  return out;
}

function readCargo(dir: string): ProjectFacts {
  const doc: TomlTable = parseToml(fs.readFileSync(path.join(dir, "Cargo.toml"), "utf8"));
  const facts: ProjectFacts = {};
  const pkg = tomlTable(doc, "package");
  if (typeof pkg?.name === "string") {
    facts.names = [{ namespace: "crates", name: crateName(pkg.name), source: "Cargo.toml package name" }];
  }
  const dependencies: ProjectFacts["dependencies"] = [];
  const paths: ProjectFacts["paths"] = [];
  const tables = [
    tomlTable(doc, "dependencies"),
    tomlTable(doc, "dev-dependencies"),
    tomlTable(doc, "build-dependencies"),
    tomlTable(doc, "workspace", "dependencies"),
  ];
  for (const table of tables) {
    for (const [name, spec] of Object.entries(table ?? {})) {
      const detail = typeof spec === "object" && !Array.isArray(spec) ? spec : undefined;
      if (typeof detail?.path === "string") {
        paths.push({ path: path.resolve(dir, detail.path), rule: "Cargo.toml path dependency" });
      } else {
        const real = typeof detail?.package === "string" ? detail.package : name;
        dependencies.push({ namespace: "crates", name: crateName(real), rule: "Cargo.toml dependency" });
      }
    }
  }
  facts.dependencies = dependencies;
  facts.paths = paths;
  if (pkg) {
    const entries: { file: string; rule: string }[] = [];
    const lib = tomlTable(doc, "lib");
    const libPath = typeof lib?.path === "string" ? lib.path : "src/lib.rs";
    entries.push({ file: path.resolve(dir, libPath), rule: lib?.path ? "Cargo.toml [lib] path" : "Cargo target auto-discovery (library)" });
    entries.push({ file: path.resolve(dir, "src/main.rs"), rule: "Cargo target auto-discovery (binary)" });
    const binDir = path.join(dir, "src", "bin");
    for (const f of fs.existsSync(binDir) ? fs.readdirSync(binDir).filter((f) => f.endsWith(".rs")).sort() : []) {
      entries.push({ file: path.join(binDir, f), rule: "Cargo target auto-discovery (binary)" });
    }
    for (const bin of Array.isArray(doc.bin) ? doc.bin : []) {
      const p = typeof bin === "object" && !Array.isArray(bin) ? bin.path : undefined;
      if (typeof p === "string") {
        entries.push({ file: path.resolve(dir, p), rule: "Cargo.toml [[bin]] path" });
      }
    }
    facts.entries = entries;
    facts.sourceRoots = [{ dir: path.dirname(path.resolve(dir, libPath)), rule: "Cargo crate root folder" }];
  }
  return facts;
}

export const cargo: EcosystemPack = {
  id: "cargo",
  label: "Rust (Cargo)",
  markers: [{ kind: "Rust crate", pattern: "Cargo.toml", matches: (f) => f === "Cargo.toml", priority: 160 }],
  readProject: (dir, fileNames) => (fileNames.includes("Cargo.toml") ? readCargo(dir) : {}),
  imports: {
    files: (f) => f.endsWith(".rs"),
    // `use other_crate::…` and `extern crate other_crate;` name a crate.
    read: (text) => [
      ...readRustImports(text)
        .filter((s) => s.startsWith("use:"))
        .map((s) => s.slice(4).replace(/^::/, "").split("::")[0])
        .filter((s) => s && !["crate", "self", "super", "std", "core", "alloc"].includes(s)),
      ...[...stripCLike(text).matchAll(/^\s*extern\s+crate\s+(\w+)/gm)].map((m) => m[1]),
    ],
    namespace: "crates",
    rule: "use of a crate name",
  },
  code: [
    {
      files: (f) => f.endsWith(".rs"),
      read: readRustImports,
      resolve: (spec, fromFile, context) => {
        if (spec.startsWith("mod:")) {
          return moduleFile(childDir(fromFile), spec.slice(4), context);
        }
        const segments = spec.slice(4).split("::").filter(Boolean);
        const root = context.facts.flatMap((f) => f.sourceRoots ?? []).find((r) => r.rule.startsWith("Cargo"))?.dir;
        if (segments[0] === "crate" && root) {
          return walk(root, segments.slice(1), context);
        }
        if (segments[0] === "self") {
          return walk(childDir(fromFile), segments.slice(1), context);
        }
        if (segments[0] === "super") {
          let dir = childDir(fromFile);
          let rest = segments;
          while (rest[0] === "super") {
            dir = path.dirname(dir);
            rest = rest.slice(1);
          }
          return walk(dir, rest, context) ?? [path.join(dir, "mod.rs"), dir + ".rs"].find((f) => context.isFile(f));
        }
        return undefined;
      },
      entry: (text) => (/^\s*fn\s+main\s*\(\s*\)/m.test(stripCLike(text)) ? "fn main" : undefined),
      rule: "mod / use",
    },
  ],
};
