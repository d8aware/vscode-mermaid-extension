/** JavaScript / TypeScript: npm packages, Angular and Nx workspaces, tsconfig path aliases, imports. */
import * as fs from "fs";
import * as path from "path";
import { ts } from "ts-morph";
import type { CodeContext, EcosystemPack, ProjectFacts } from "../types";

const readJson = (file: string): any => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
};

/** `compilerOptions.paths` from tsconfig.base.json, else tsconfig.json (no `extends`). */
function readPaths(dir: string, fileNames: string[]): Map<string, string> | undefined {
  const configName = ["tsconfig.base.json", "tsconfig.json"].find((f) => fileNames.includes(f));
  if (!configName) {
    return undefined;
  }
  let parsed: any;
  try {
    parsed = ts.parseConfigFileTextToJson(configName, fs.readFileSync(path.join(dir, configName), "utf8")).config;
  } catch {
    return undefined;
  }
  const options = parsed?.compilerOptions;
  if (!options?.paths) {
    return undefined;
  }
  const base = path.resolve(dir, options.baseUrl ?? ".");
  const paths = new Map<string, string>();
  for (const [alias, targets] of Object.entries<string[]>(options.paths)) {
    if (Array.isArray(targets) && targets.length) {
      paths.set(alias.replace(/\/\*$/, ""), path.resolve(base, String(targets[0]).replace(/\/\*$/, "")));
    }
  }
  return paths;
}

const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

/** Module resolution as TypeScript does it for a path: the file, with an extension, or the folder's index (a folder without one counts as the folder). */
function resolveModulePath(base: string, context: CodeContext): string | undefined {
  const candidates = [
    base,
    ...EXTENSIONS.map((e) => base + e),
    // ESM style: `./x.js` written for `./x.ts`.
    ...(/\.[cm]?js$/.test(base) ? [".ts", ".tsx", ".mts", ".cts"].map((e) => base.replace(/\.[cm]?js$/, e)) : []),
    ...EXTENSIONS.map((e) => path.join(base, "index" + e)),
  ];
  return candidates.find((c) => context.isFile(c)) ?? (context.isDir(base) ? base : undefined);
}

/** Declared entry points and source roots: angular.json and project.json build targets, package.json fields. */
function readTargets(dir: string, fileNames: string[], facts: ProjectFacts) {
  const roots: { dir: string; rule: string }[] = [];
  const entries: { file: string; rule: string }[] = [];
  // Nx writes project.json paths relative to the workspace root: the first of this folder and its parents where the path exists inside this folder.
  let workspaceRelative = false;
  const resolve = (value: string) => {
    if (!workspaceRelative) {
      return path.resolve(dir, value);
    }
    for (let base = dir; ; base = path.dirname(base)) {
      const candidate = path.resolve(base, value);
      if ((candidate === dir || candidate.startsWith(dir + path.sep)) && fs.existsSync(candidate)) {
        return candidate;
      }
      if (path.dirname(base) === base) {
        return path.resolve(dir, value);
      }
    }
  };
  const entry = (value: unknown, rule: string) => {
    if (typeof value === "string" && value) {
      entries.push({ file: resolve(value), rule });
    }
  };
  const targetsOf = (config: any, file: string) => {
    const targets = { ...config?.architect, ...config?.targets };
    for (const targetName of Object.keys(targets).sort()) {
      for (const field of ["main", "browser", "server"]) {
        entry(targets[targetName]?.options?.[field], `${file} ${targetName} ${field}`);
      }
    }
  };
  if (fileNames.includes("angular.json")) {
    const angular = readJson(path.join(dir, "angular.json"));
    for (const [, project] of Object.entries<any>(angular?.projects ?? {}).sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (typeof project?.sourceRoot === "string") {
        roots.push({ dir: path.resolve(dir, project.sourceRoot), rule: "angular.json sourceRoot" });
      }
      targetsOf(project, "angular.json");
    }
  }
  if (fileNames.includes("project.json")) {
    const project = readJson(path.join(dir, "project.json"));
    workspaceRelative = true;
    if (typeof project?.sourceRoot === "string") {
      roots.push({ dir: resolve(project.sourceRoot), rule: "project.json sourceRoot" });
    }
    targetsOf(project, "project.json");
    workspaceRelative = false;
  }
  if (fileNames.includes("package.json")) {
    const pkg = readJson(path.join(dir, "package.json"));
    entry(pkg?.main, "package.json main");
    entry(pkg?.module, "package.json module");
    entry(typeof pkg?.bin === "string" ? pkg.bin : undefined, "package.json bin");
    for (const value of typeof pkg?.bin === "object" && pkg.bin ? Object.values(pkg.bin) : []) {
      entry(value, "package.json bin");
    }
    const dot = typeof pkg?.exports === "string" ? pkg.exports : pkg?.exports?.["."];
    entry(typeof dot === "string" ? dot : dot?.import ?? dot?.require ?? dot?.default, "package.json exports");
  }
  if (roots.length) {
    facts.sourceRoots = roots;
  }
  if (entries.length) {
    facts.entries = entries;
  }
}

const DECLARATION = /\.d\.[cm]?ts$/;

export const javascript: EcosystemPack = {
  id: "javascript",
  label: "JavaScript / TypeScript (npm, Angular, Nx)",
  markers: [
    { kind: "Nx workspace", pattern: "nx.json", matches: (f) => f === "nx.json", priority: 10 },
    { kind: "Angular workspace", pattern: "angular.json", matches: (f) => f === "angular.json", priority: 20 },
    { kind: "npm package", pattern: "package.json", matches: (f) => f === "package.json", priority: 60 },
    { kind: "Nx project", pattern: "project.json", matches: (f) => f === "project.json", priority: 70 },
    { kind: "TypeScript project", pattern: "tsconfig.json", matches: (f) => f === "tsconfig.json", priority: 80 },
  ],
  readProject: (dir, fileNames) => {
    const facts: ProjectFacts = { aliases: readPaths(dir, fileNames) };
    if (fileNames.includes("package.json")) {
      const pkg = readJson(path.join(dir, "package.json"));
      if (typeof pkg?.name === "string" && pkg.name) {
        facts.names = [{ namespace: "npm", name: pkg.name, source: "package.json" }];
      }
      facts.dependencies = Object.keys({ ...pkg?.dependencies, ...pkg?.devDependencies, ...pkg?.peerDependencies }).map((name) => ({
        namespace: "npm",
        name,
        rule: "package.json dependency",
      }));
    }
    readTargets(dir, fileNames, facts);
    return facts;
  },
  imports: {
    files: (f) => SOURCE.test(f) && !DECLARATION.test(f),
    // TypeScript's own import scanner: comments and strings do not count.
    read: (text) =>
      ts
        .preProcessFile(text, true, true)
        .importedFiles.map((i) => i.fileName)
        .filter((spec) => !spec.startsWith(".") && !spec.startsWith("/")),
    namespace: "npm",
    rule: "import of a package name",
    aliasRule: "import of a tsconfig path alias",
  },
  code: [
    {
      files: (f) => SOURCE.test(f) && !DECLARATION.test(f),
      read: (text) => ts.preProcessFile(text, true, true).importedFiles.map((i) => i.fileName),
      resolve: (spec, fromFile, context) => {
        if (spec.startsWith(".")) {
          return resolveModulePath(path.resolve(path.dirname(fromFile), spec), context);
        }
        const aliased = context.alias(spec);
        return aliased ? resolveModulePath(aliased, context) : undefined;
      },
      rule: "import",
    },
  ],
};
