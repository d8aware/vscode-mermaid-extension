/** Go: workspaces and modules; module-path imports, `require` and local `replace`. */
import * as fs from "fs";
import * as path from "path";
import { parseGoImports, parseGoMod } from "../../landscape/golang";
import type { EcosystemPack, ProjectFacts } from "../types";

export const goModules: EcosystemPack = {
  id: "go",
  label: "Go (modules)",
  markers: [
    { kind: "Go workspace", pattern: "go.work", matches: (f) => f === "go.work", priority: 130 },
    { kind: "Go module", pattern: "go.mod", matches: (f) => f === "go.mod", priority: 140 },
  ],
  readProject: (dir, fileNames) => {
    if (!fileNames.includes("go.mod")) {
      return {};
    }
    let mod;
    try {
      mod = parseGoMod(fs.readFileSync(path.join(dir, "go.mod"), "utf8"));
    } catch {
      return {};
    }
    const facts: ProjectFacts = {
      names: mod.module ? [{ namespace: "go", name: mod.module, source: "go.mod module" }] : [],
      dependencies: mod.require.map((name) => ({ namespace: "go", name, rule: "go.mod require" })),
      paths: mod.localReplace.map((r) => ({ path: path.resolve(dir, r.dir), rule: "go.mod replace with a local directory" })),
    };
    return facts;
  },
  imports: {
    files: (f) => f.endsWith(".go"),
    // Import declarations only, per the Go syntax; the longest module path wins.
    read: parseGoImports,
    namespace: "go",
    rule: "import of a Go module path",
  },
  code: [
    {
      files: (f) => f.endsWith(".go"),
      read: parseGoImports,
      // An import path inside this module is the package folder at the rest of the path.
      resolve: (spec, _from, context) => {
        const module = context.facts.flatMap((f) => f.names ?? []).find((n) => n.namespace === "go")?.name;
        if (!module || !(spec === module || spec.startsWith(module + "/"))) {
          return undefined;
        }
        const target = path.join(context.dir, spec.slice(module.length));
        return context.isDir(target) ? target : undefined;
      },
      // The Go specification: a program starts at func main in package main.
      entry: (text) => (/^\s*package\s+main\b/m.test(text) && /^func\s+main\s*\(\s*\)/m.test(text) ? "package main, func main" : undefined),
      rule: "import",
    },
  ],
};
