/**
 * Scans a folder: finds projects by the marker files of the ecosystem packs
 * (src/packs), assigns every file to its nearest project, and collects the
 * references the packs read. The engine knows no ecosystem: everything
 * specific (marker files, declared names, dependencies, imports) comes from a
 * pack. No `vscode` dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { ECOSYSTEM_PACKS, ImportRule, MARKER_RULES, MarkerRule, ProjectFacts } from "../packs";
import { IGNORED_FOLDERS } from "./rules";

export interface Marker {
  rule: MarkerRule;
  /** The file that matched, e.g. `Billing.Api.csproj`. */
  file: string;
}

export interface LandscapeProject {
  dir: string;
  /** Path relative to the scanned folder ("." for the folder itself). */
  rel: string;
  markers: Marker[];
  /** Kind of the first marker (rule priority order). */
  kind: string;
  /** The first name it declares (ecosystem pack order: package.json, composer.json, go.mod). */
  name?: string;
  /** Which file `name` came from. */
  nameSource?: string;
  parent?: LandscapeProject;
}

export interface LandscapeFile {
  path: string;
  /** Lower-case extension, or "(none)". */
  ext: string;
  /** Nearest project at or above the file. */
  owner?: LandscapeProject;
}

export interface LandscapeEdge {
  from: LandscapeProject;
  to: LandscapeProject;
  /** The pack rule that produced it, e.g. "package.json dependency". */
  rule: string;
  count: number;
}

/** One file's import that resolved to another project (the project view draws these). */
export interface FileReference {
  file: string;
  to: LandscapeProject;
  rule: string;
}

export interface LandscapeModel {
  root: string;
  /** Sorted by path. */
  projects: LandscapeProject[];
  files: LandscapeFile[];
  edges: LandscapeEdge[];
  /** Import references by file, sorted by file. */
  fileReferences: FileReference[];
}

export interface ScanOptions {
  onProgress?: (phase: "files" | "references", done: number, total: number, detail?: string) => void;
  isCancelled?: () => boolean;
}

export class ScanCancelledError extends Error {
  constructor() {
    super("Scan cancelled");
  }
}

interface ProjectData {
  project: LandscapeProject;
  facts: ProjectFacts[];
  /** Import aliases from any pack (e.g. tsconfig `paths`). */
  aliases?: Map<string, string>;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const yieldNow = () => new Promise((resolve) => setImmediate(resolve));

export async function scanFolder(folder: string, options: ScanOptions = {}): Promise<LandscapeModel> {
  const root = path.resolve(folder);
  const data: ProjectData[] = [];
  const files: LandscapeFile[] = [];

  // 1. Walk the tree (rules 1-3).
  const stack = [root];
  let visited = 0;
  while (stack.length) {
    if (options.isCancelled?.()) {
      throw new ScanCancelledError();
    }
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name).sort(compare);
    const markers: Marker[] = [];
    for (const rule of MARKER_RULES) {
      const file = fileNames.find((f) => rule.matches(f));
      if (file) {
        markers.push({ rule, file });
      }
    }
    if (markers.length) {
      const facts = ECOSYSTEM_PACKS.map((pack) => {
        try {
          return pack.readProject?.(dir, fileNames) ?? {};
        } catch {
          return {};
        }
      });
      const first = facts.flatMap((f) => f.names ?? [])[0];
      const project: LandscapeProject = {
        dir,
        rel: path.relative(root, dir).split(path.sep).join("/") || ".",
        markers,
        kind: markers[0].rule.kind,
        name: first?.name,
        nameSource: first?.source,
      };
      data.push({ project, facts, aliases: facts.find((f) => f.aliases)?.aliases });
    }
    for (const f of fileNames) {
      const ext = path.extname(f).toLowerCase();
      files.push({ path: path.join(dir, f), ext: ext || "(none)" });
    }
    entries
      .filter((e) => e.isDirectory() && !IGNORED_FOLDERS.has(e.name))
      .map((e) => path.join(dir, e.name))
      .sort(compare)
      .reverse()
      .forEach((d) => stack.push(d));
    if (++visited % 200 === 0) {
      options.onProgress?.("files", files.length, 0);
      await yieldNow();
    }
  }

  // 2. Ownership: the nearest project at or above (rule 5).
  const byDepth = [...data].sort((a, b) => b.project.dir.length - a.project.dir.length);
  const ownerOf = (p: string) => byDepth.find((d) => p === d.project.dir || p.startsWith(d.project.dir + path.sep));
  for (const d of data) {
    d.project.parent = byDepth.find((o) => o !== d && d.project.dir.startsWith(o.project.dir + path.sep))?.project;
  }
  for (const f of files) {
    f.owner = ownerOf(f.path)?.project;
  }
  const dataOf = new Map(data.map((d) => [d.project, d]));

  // 3. References (rule 4).
  const counts = new Map<string, LandscapeEdge>();
  const fileReferences: FileReference[] = [];
  const add = (from: LandscapeProject | undefined, to: LandscapeProject | undefined, rule: string, file?: string) => {
    if (!from || !to || from === to) {
      return;
    }
    if (file) {
      fileReferences.push({ file, to, rule });
    }
    const key = `${from.rel}|${to.rel}|${rule}`;
    const edge = counts.get(key) ?? { from, to, rule, count: 0 };
    edge.count++;
    counts.set(key, edge);
  };
  // Declared names per namespace; a name can be declared by several projects (copies, forks, fixtures).
  const names = new Map<string, Map<string, LandscapeProject[]>>();
  for (const d of [...data].sort((a, b) => compare(a.project.rel, b.project.rel))) {
    for (const { namespace, name } of d.facts.flatMap((f) => f.names ?? [])) {
      const space = names.get(namespace) ?? new Map<string, LandscapeProject[]>();
      space.set(name, [...(space.get(name) ?? []), d.project]);
      names.set(namespace, space);
    }
  }
  /** Of several projects declaring a name, the closest to `from` (longest shared folder path; ties by path). */
  const sharedLength = (a: string, b: string) => {
    const x = a.split(path.sep);
    const y = b.split(path.sep);
    let n = 0;
    while (n < x.length && n < y.length && x[n] === y[n]) {
      n++;
    }
    return n;
  };
  const closest = (from: LandscapeProject | undefined, candidates: LandscapeProject[] | undefined) =>
    from && candidates?.length
      ? candidates.reduce((best, c) => (sharedLength(c.dir, from.dir) > sharedLength(best.dir, from.dir) ? c : best))
      : candidates?.[0];
  const matchName = <T>(map: Map<string, T> | undefined, spec: string): T | undefined => {
    if (!map) {
      return undefined;
    }
    if (map.has(spec)) {
      return map.get(spec);
    }
    // Deep imports: `@scope/pkg/sub/path` matches `@scope/pkg`; Go packages match their module.
    const parts = spec.split("/");
    for (let n = parts.length - 1; n > 0; n--) {
      const prefix = parts.slice(0, n).join("/");
      if (map.has(prefix)) {
        return map.get(prefix);
      }
    }
    return undefined;
  };

  // Imports: a pack's source files, while there is something they could resolve to.
  const importRules = ECOSYSTEM_PACKS.map((p) => p.imports).filter(
    (rule): rule is ImportRule => !!rule && (names.has(rule.namespace) || !!rule.aliasRule)
  );
  const sources = files
    .filter((f) => f.owner)
    .map((f) => ({ file: f, rule: importRules.find((r) => r.files(f.path)) }))
    .filter((x): x is { file: LandscapeFile; rule: ImportRule } => !!x.rule);
  for (let i = 0; i < sources.length; i++) {
    if (i % 100 === 0) {
      if (options.isCancelled?.()) {
        throw new ScanCancelledError();
      }
      options.onProgress?.("references", i, sources.length, path.basename(sources[i].file.path));
      await yieldNow();
    }
    const { file, rule } = sources[i];
    let text: string;
    try {
      text = fs.readFileSync(file.path, "utf8");
    } catch {
      continue;
    }
    for (const spec of rule.read(text)) {
      // An alias resolves through the nearest project that defines one matching it.
      let aliasTarget: string | undefined;
      if (rule.aliasRule) {
        for (let p: LandscapeProject | undefined = file.owner; p && !aliasTarget; p = p.parent) {
          aliasTarget = matchName(dataOf.get(p)?.aliases, spec);
        }
      }
      if (aliasTarget) {
        add(file.owner, ownerOf(aliasTarget)?.project, rule.aliasRule!, file.path);
      } else {
        add(file.owner, closest(file.owner, matchName(names.get(rule.namespace), spec)), rule.rule, file.path);
      }
    }
  }
  options.onProgress?.("references", sources.length, sources.length);

  // Declared dependencies (by name) and references (by path).
  for (const d of data) {
    for (const facts of d.facts) {
      for (const dep of facts.dependencies ?? []) {
        add(d.project, closest(d.project, names.get(dep.namespace)?.get(dep.name)), dep.rule);
      }
      for (const ref of facts.paths ?? []) {
        add(d.project, ownerOf(ref.path)?.project, ref.rule);
      }
    }
  }

  return {
    root,
    projects: data.map((d) => d.project).sort((a, b) => compare(a.rel, b.rel)),
    files,
    fileReferences: fileReferences.sort((a, b) => compare(`${a.file}|${a.to.rel}`, `${b.file}|${b.to.rel}`)),
    edges: [...counts.values()].sort((a, b) => compare(`${a.from.rel}|${a.to.rel}|${a.rule}`, `${b.from.rel}|${b.to.rel}|${b.rule}`)),
  };
}
