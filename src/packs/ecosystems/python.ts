/** Python: pyproject.toml (PEP 621, Poetry) and requirements.txt; imports by module path. */
import * as fs from "fs";
import * as path from "path";
import type { CodeContext, EcosystemPack, ProjectFacts } from "../types";
import { parseToml, stripHashComments, TomlTable, tomlTable } from "./formats";

/** PEP 503: names compare case-insensitively with runs of `-`, `_`, `.` as one `-`. */
export const normalizePypi = (name: string) => name.toLowerCase().replace(/[-_.]+/g, "-");

/** The distribution name at the start of a PEP 508 requirement. */
const requirementName = (req: string) => /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(req)?.[1];

/** Folders absolute imports resolve from: the project folder, and `src/` (the PyPA src layout) or a declared package-dir. */
function importBases(context: CodeContext): string[] {
  const declared = context.facts.flatMap((f) => f.sourceRoots ?? []).map((r) => r.dir);
  return [context.dir, ...declared, path.join(context.dir, "src")].filter((d, i, all) => all.indexOf(d) === i && context.isDir(d));
}

/** A dotted module path from a base: the longest prefix that is a module file or a package folder. */
function resolveDotted(base: string, parts: string[], context: CodeContext): string | undefined {
  for (let n = parts.length; n > 0; n--) {
    const p = path.join(base, ...parts.slice(0, n));
    if (context.isFile(p + ".py")) {
      return p + ".py";
    }
    if (context.isDir(p)) {
      return context.isFile(path.join(p, "__init__.py")) ? path.join(p, "__init__.py") : p;
    }
  }
  return undefined;
}

/**
 * Imports as module paths: `import a.b` -> "a.b"; `from a.b import c, d` ->
 * "a.b.c", "a.b.d" (each name may be a submodule; resolution takes the longest
 * existing prefix); relative `from ..a import b` -> "..a.b".
 */
export function readPythonImports(text: string): string[] {
  const code = stripHashComments(text).replace(/\\\n/g, " ");
  const out: string[] = [];
  // Parenthesised name lists may span lines.
  const joined = code.replace(/\(([^()]*)\)/g, (_m, inner: string) => "(" + inner.replace(/\n/g, " ") + ")");
  for (const line of joined.split("\n")) {
    const from = /^\s*from\s+(\.*[\w.]*)\s+import\s+\(?([^)]*)\)?\s*$/.exec(line);
    if (from) {
      const module = from[1];
      for (const raw of from[2].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (name === "*" || !name) {
          out.push(module);
        } else if (/^\w+$/.test(name)) {
          out.push(module.endsWith(".") || module === "" ? module + name : `${module}.${name}`);
        }
      }
      continue;
    }
    const imp = /^\s*import\s+(.+)$/.exec(line);
    if (imp) {
      for (const raw of imp[1].split(",")) {
        const name = raw.trim().split(/\s+as\s+/)[0];
        if (/^[\w.]+$/.test(name)) {
          out.push(name);
        }
      }
    }
  }
  return out;
}

function readPyproject(dir: string, facts: ProjectFacts) {
  let doc: TomlTable;
  try {
    doc = parseToml(fs.readFileSync(path.join(dir, "pyproject.toml"), "utf8"));
  } catch {
    return;
  }
  const project = tomlTable(doc, "project");
  const poetry = tomlTable(doc, "tool", "poetry");
  const name = typeof project?.name === "string" ? project.name : typeof poetry?.name === "string" ? poetry.name : undefined;
  if (name) {
    facts.names = [{ namespace: "pypi", name: normalizePypi(name), source: "pyproject.toml name" }];
  }
  const deps: string[] = [];
  for (const req of Array.isArray(project?.dependencies) ? project!.dependencies : []) {
    deps.push(requirementName(String(req)) ?? "");
  }
  for (const group of Object.values(tomlTable(project, "optional-dependencies") ?? {})) {
    for (const req of Array.isArray(group) ? group : []) {
      deps.push(requirementName(String(req)) ?? "");
    }
  }
  const poetryDeps = { ...tomlTable(poetry, "dependencies"), ...tomlTable(poetry, "dev-dependencies"), ...tomlTable(poetry, "group", "dev", "dependencies") };
  const paths: { path: string; rule: string }[] = [];
  for (const [dep, spec] of Object.entries(poetryDeps)) {
    if (dep.toLowerCase() === "python") {
      continue;
    }
    const local = typeof spec === "object" && !Array.isArray(spec) && typeof spec.path === "string" ? spec.path : undefined;
    if (local) {
      paths.push({ path: path.resolve(dir, local), rule: "pyproject.toml path dependency" });
    } else {
      deps.push(dep);
    }
  }
  facts.dependencies = [
    ...(facts.dependencies ?? []),
    ...deps.filter(Boolean).map((d) => ({ namespace: "pypi", name: normalizePypi(d), rule: "pyproject.toml dependency" })),
  ];
  if (paths.length) {
    facts.paths = paths;
  }
  const packageDir = tomlTable(doc, "tool", "setuptools", "package-dir")?.[""];
  if (typeof packageDir === "string") {
    facts.sourceRoots = [{ dir: path.resolve(dir, packageDir), rule: "pyproject.toml tool.setuptools package-dir" }];
  }
  // [project.scripts] name = "pkg.module:function": the module is the entry.
  const scripts = { ...tomlTable(project, "scripts"), ...tomlTable(poetry, "scripts") };
  const entries: { file: string; rule: string }[] = [];
  for (const target of Object.values(scripts)) {
    const module = typeof target === "string" ? target.split(":")[0].trim() : undefined;
    if (module) {
      for (const base of [packageDir ? path.resolve(dir, String(packageDir)) : dir, path.join(dir, "src"), dir]) {
        const file = path.join(base, ...module.split(".")) + ".py";
        if (fs.existsSync(file)) {
          entries.push({ file, rule: "pyproject.toml scripts" });
          break;
        }
      }
    }
  }
  if (entries.length) {
    facts.entries = entries;
  }
}

export const python: EcosystemPack = {
  id: "python",
  label: "Python (pyproject, requirements)",
  markers: [
    {
      kind: "Python project",
      pattern: "pyproject.toml / requirements.txt / setup.py",
      matches: (f) => f === "pyproject.toml" || f === "requirements.txt" || f === "setup.py",
      priority: 120,
    },
  ],
  readProject: (dir, fileNames) => {
    const facts: ProjectFacts = {};
    if (fileNames.includes("pyproject.toml")) {
      readPyproject(dir, facts);
    }
    if (fileNames.includes("requirements.txt")) {
      let text = "";
      try {
        text = fs.readFileSync(path.join(dir, "requirements.txt"), "utf8");
      } catch {
        // no facts
      }
      const names = stripHashComments(text)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("-"))
        .map(requirementName)
        .filter((n): n is string => !!n);
      facts.dependencies = [
        ...(facts.dependencies ?? []),
        ...names.map((name) => ({ namespace: "pypi", name: normalizePypi(name), rule: "requirements.txt" })),
      ];
    }
    return facts;
  },
  code: [
    {
      files: (f) => f.endsWith(".py"),
      read: readPythonImports,
      resolve: (spec, fromFile, context) => {
        const dots = /^\.*/.exec(spec)![0].length;
        const parts = spec.slice(dots).split(".").filter(Boolean);
        if (dots) {
          // Relative: one dot is the importing module's package; each further dot one package up.
          let base = path.dirname(fromFile);
          for (let n = 1; n < dots; n++) {
            base = path.dirname(base);
          }
          return parts.length ? resolveDotted(base, parts, context) : base;
        }
        for (const base of importBases(context)) {
          if (context.isDir(path.join(base, parts[0])) || context.isFile(path.join(base, parts[0] + ".py"))) {
            return resolveDotted(base, parts, context);
          }
        }
        return undefined;
      },
      entry: (text, file) =>
        path.basename(file) === "__main__.py"
          ? "__main__ module"
          : /^if\s+__name__\s*==\s*["']__main__["']\s*:/m.test(stripHashComments(text))
            ? 'if __name__ == "__main__"'
            : undefined,
      rule: "import",
    },
  ],
};
