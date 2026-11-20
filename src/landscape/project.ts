/**
 * The project view: one project's own code, a folder at a time. Boxes are the
 * folder's subfolders and code files; arrows are imports between them, read
 * and resolved by the packs' code rules (src/packs, `EcosystemPack.code`).
 * Entry points are what the project files declare (a build target's `main`,
 * `[project.scripts]`, Cargo targets) or what the language itself marks
 * (`package main`, `static Main`, `if __name__ == "__main__"`). The engine
 * knows no language. No `vscode` dependency.
 */
import * as fs from "fs";
import * as path from "path";
import { CodeContext, CodeRule, ECOSYSTEM_PACKS, languagePackFor, ProjectFacts } from "../packs";
import { DECLARATION_FILE, GRID_ROW, MAX_ARROWS_PER_VIEW } from "./rules";
import { LandscapeFile, LandscapeModel, LandscapeProject, ScanCancelledError } from "./scan";
import { composition } from "./view";

export interface ProjectLink {
  from: string;
  /** A file, or a folder (a Go package, a Python package without `__init__.py`). */
  to: string;
  rule: string;
}

/** An import of another project, from one of this project's files (read by the landscape scan). */
export interface ProjectReference {
  from: string;
  to: LandscapeProject;
  rule: string;
}

export interface ProjectCode {
  project: LandscapeProject;
  /** The project's own files: not inside a project nested in it. */
  files: LandscapeFile[];
  /** Declared source roots that exist (deduplicated). */
  sourceRoots: { dir: string; rule: string }[];
  /** Where the view opens: the single declared source root, else the project folder. */
  start: string;
  /** Entry file -> the rule that makes it one. */
  entries: Map<string, string>;
  links: ProjectLink[];
  /** Imports of other projects. */
  references: ProjectReference[];
  /** Files left out of arrows (test files), by language pack rule. */
  testFiles: Set<string>;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const within = (p: string, dir: string) => p.startsWith(dir + path.sep);
const esc = (s: string) => s.replace(/"/g, "'").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const yieldNow = () => new Promise((resolve) => setImmediate(resolve));

/** Reads a project's facts from every ecosystem pack. */
function factsOf(dir: string): ProjectFacts[] {
  let fileNames: string[] = [];
  try {
    fileNames = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name).sort(compare);
  } catch {
    return [];
  }
  return ECOSYSTEM_PACKS.map((pack) => {
    try {
      return pack.readProject?.(dir, fileNames) ?? {};
    } catch {
      return {};
    }
  });
}

/** An alias map lookup: exact, else the longest `/` prefix with the rest appended. */
function matchAlias(aliases: Map<string, string> | undefined, spec: string): string | undefined {
  if (!aliases) {
    return undefined;
  }
  const parts = spec.split("/");
  for (let n = parts.length; n > 0; n--) {
    const target = aliases.get(parts.slice(0, n).join("/"));
    if (target) {
      return path.join(target, ...parts.slice(n));
    }
  }
  return undefined;
}

export interface ReadOptions {
  onProgress?: (done: number, total: number, detail?: string) => void;
  isCancelled?: () => boolean;
  /** Read test files' imports too (classDiagram.includeTestFiles). */
  includeTestFiles?: boolean;
}

export async function readProjectCode(model: LandscapeModel, project: LandscapeProject, options: ReadOptions = {}): Promise<ProjectCode> {
  const files = model.files.filter((f) => f.owner === project);
  const own = new Set(files.map((f) => f.path));
  const allFiles = new Set(model.files.map((f) => f.path));
  const allDirs = new Set<string>();
  for (const f of model.files) {
    for (let d = path.dirname(f.path); within(d, model.root) && !allDirs.has(d); d = path.dirname(d)) {
      allDirs.add(d);
    }
  }
  allDirs.add(model.root);
  const nested = model.projects.filter((p) => p !== project && within(p.dir, project.dir));
  const ownDir = (d: string) => (d === project.dir || within(d, project.dir)) && !nested.some((n) => d === n.dir || within(d, n.dir));

  const facts = factsOf(project.dir);
  const parentAliases: (Map<string, string> | undefined)[] = [];
  for (let p = project.parent; p; p = p.parent) {
    parentAliases.push(factsOf(p.dir).find((f) => f.aliases)?.aliases);
  }
  const context: CodeContext = {
    dir: project.dir,
    facts,
    alias: (spec) => [facts.find((f) => f.aliases)?.aliases, ...parentAliases].map((a) => matchAlias(a, spec)).find(Boolean),
    isFile: (p) => allFiles.has(path.resolve(p)),
    isDir: (p) => allDirs.has(path.resolve(p)),
  };

  const sourceRoots = facts
    .flatMap((f) => f.sourceRoots ?? [])
    .map((r) => ({ dir: path.resolve(r.dir), rule: r.rule }))
    .filter((r, i, all) => ownDir(r.dir) && allDirs.has(r.dir) && all.findIndex((o) => o.dir === r.dir) === i);
  const entries = new Map<string, string>();
  for (const e of facts.flatMap((f) => f.entries ?? [])) {
    const file = path.resolve(e.file);
    if (own.has(file) && !entries.has(file)) {
      entries.set(file, e.rule);
    }
  }
  // The view opens at the single source root, unless a declared entry point lies outside it.
  const start =
    sourceRoots.length === 1 && [...entries.keys()].every((e) => within(e, sourceRoots[0].dir)) ? sourceRoots[0].dir : project.dir;

  const rules = ECOSYSTEM_PACKS.flatMap((p) => p.code ?? []);
  const testFiles = new Set<string>();
  const read: { file: string; rule: CodeRule; specs: string[] }[] = [];
  const declared = new Map<string, string[]>(); // "<separator><namespace>" -> files
  const sources = files.filter((f) => !DECLARATION_FILE.test(f.path)).map((f) => ({ file: f.path, rule: rules.find((r) => r.files(f.path)) }));
  for (let i = 0; i < sources.length; i++) {
    const { file, rule } = sources[i];
    if (i % 100 === 0) {
      if (options.isCancelled?.()) {
        throw new ScanCancelledError();
      }
      options.onProgress?.(i, sources.length, path.basename(file));
      await yieldNow();
    }
    if (!rule) {
      continue;
    }
    if (!options.includeTestFiles && languagePackFor(file)?.testFile?.test(path.basename(file))) {
      testFiles.add(file);
      continue;
    }
    let text: string;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const entry = rule.entry?.(text, file);
    if (entry && !entries.has(file)) {
      entries.set(file, entry);
    }
    for (const ns of rule.declares?.(text) ?? []) {
      const key = `${rule.separator ?? "."}${ns}`;
      declared.set(key, [...(declared.get(key) ?? []), file]);
    }
    read.push({ file, rule, specs: rule.read(text) });
  }
  options.onProgress?.(sources.length, sources.length);

  const links: ProjectLink[] = [];
  const keep = (from: string, to: string | undefined, rule: string) => {
    if (to && to !== from && (own.has(to) || (allDirs.has(to) && ownDir(to)))) {
      links.push({ from, to, rule });
    }
  };
  for (const { file, rule, specs } of read) {
    for (const spec of specs) {
      const resolved = rule.resolve?.(spec, file, context);
      if (resolved) {
        keep(file, path.resolve(resolved), rule.rule);
        continue;
      }
      if (!rule.declares) {
        continue;
      }
      // A namespace import: the longest declared namespace prefix; a following segment naming a file picks that file.
      const sep = rule.separator ?? ".";
      const parts = spec.split(sep);
      for (let n = parts.length; n > 0; n--) {
        const candidates = declared.get(sep + parts.slice(0, n).join(sep));
        if (candidates) {
          const next = parts[n];
          const named = next ? candidates.filter((c) => path.basename(c).replace(/\.[^.]+$/, "") === next) : [];
          for (const target of named.length ? named : [...new Set(candidates)]) {
            keep(file, target, rule.rule);
          }
          break;
        }
      }
    }
  }
  links.sort((a, b) => compare(`${a.from}|${a.to}`, `${b.from}|${b.to}`));
  const references = model.fileReferences
    .filter((r) => own.has(r.file) && !testFiles.has(r.file))
    .map((r) => ({ from: r.file, to: r.to, rule: r.rule }));
  return { project, files, sourceRoots, start, entries, links, references, testFiles };
}

// ---------------------------------------------------------------------------
// Rendering

export type ProjectTarget =
  | { type: "folder"; dir: string }
  | { type: "file"; file: string; explorable: boolean }
  | { type: "files"; files: string[] }
  | { type: "project-files"; project: LandscapeProject }
  | { type: "project"; project: LandscapeProject };

export interface ProjectView {
  mermaid: string;
  /** The folder shown (a folder holding one folder and no files is passed through). */
  folder: string;
  nodes: Map<string, ProjectTarget>;
  tooltips: Map<string, string>;
  arrows: { shown: number; total: number };
}

/** Files shown as their own boxes per folder; the rest are one "more files" box. */
export const MAX_FILE_BOXES = 12;

/** The folder the view shows for `folder`: passes through folders holding exactly one folder and no files (Java packages, `src/`). */
export function shownFolder(code: ProjectCode, folder: string): string {
  for (;;) {
    const direct = code.files.some((f) => path.dirname(f.path) === folder);
    const children = new Set(code.files.filter((f) => within(f.path, folder)).map((f) => path.relative(folder, f.path).split(path.sep)[0]));
    if (direct || children.size !== 1) {
      return folder;
    }
    folder = path.join(folder, [...children][0]);
  }
}

export function renderProjectView(code: ProjectCode, requested: string): ProjectView {
  const { project } = code;
  const folder = shownFolder(code, requested);
  const rel = (p: string) => path.relative(project.dir, p).split(path.sep).join("/") || ".";
  const nodes = new Map<string, ProjectTarget>();
  const tooltips = new Map<string, string>();
  const isCode = (f: string) => !!languagePackFor(f) && !DECLARATION_FILE.test(f);

  // The items of this level: subfolders and files directly in it.
  const inFolder = code.files.filter((f) => within(f.path, folder));
  const subfolders = [...new Set(inFolder.filter((f) => path.dirname(f.path) !== folder).map((f) => path.relative(folder, f.path).split(path.sep)[0]))].sort(compare);
  const direct = inFolder.filter((f) => path.dirname(f.path) === folder).map((f) => f.path).sort(compare);
  const codeFiles = direct.filter((f) => isCode(f) || code.entries.has(f));
  const shownFiles = [
    ...codeFiles.filter((f) => code.entries.has(f)),
    ...codeFiles.filter((f) => !code.entries.has(f)),
  ].slice(0, MAX_FILE_BOXES);
  const moreFiles = codeFiles.filter((f) => !shownFiles.includes(f));
  const markerFiles = new Set(project.markers.map((m) => path.join(project.dir, m.file)));
  const otherFiles = direct.filter((f) => !codeFiles.includes(f) && !markerFiles.has(f));

  const idOf = (p: string) => "n_" + (rel(p) === "." ? "root" : rel(p).replace(/[^A-Za-z0-9]/g, "_"));
  /** The box at this level that a path falls in, or undefined when outside this folder. */
  const itemOf = (p: string): string | undefined => {
    if (shownFiles.includes(p)) {
      return idOf(p);
    }
    if (moreFiles.includes(p)) {
      return "more";
    }
    if (otherFiles.includes(p)) {
      return "other";
    }
    return within(p, folder) ? idOf(path.join(folder, path.relative(folder, p).split(path.sep)[0])) : undefined;
  };
  /** Outside this folder: the folder (or file) just below the closest folder above this one that holds it. */
  const outsideOf = (p: string) => {
    let ancestor = path.dirname(folder);
    while (!within(p, ancestor) && ancestor !== project.dir && within(ancestor, project.dir)) {
      ancestor = path.dirname(ancestor);
    }
    return path.join(ancestor, path.relative(ancestor, p).split(path.sep)[0]);
  };
  /** A folder at or above this one: not a box (a package importing its own parent package). */
  const above = (p: string) => p === folder || within(folder, p);

  interface Arrow {
    a: string;
    b: string;
    count: number;
    rules: Set<string>;
  }
  const arrows = new Map<string, Arrow>();
  const outside = new Map<string, string>(); // node id -> folder or file
  for (const link of code.links) {
    if (above(link.to) || above(link.from)) {
      continue;
    }
    let a = itemOf(link.from);
    let b = itemOf(link.to);
    if (!a && !b) {
      continue;
    }
    if (!a) {
      const target = outsideOf(link.from);
      a = "x" + idOf(target);
      outside.set(a, target);
    }
    if (!b) {
      const target = outsideOf(link.to);
      b = "x" + idOf(target);
      outside.set(b, target);
    }
    if (a === b) {
      continue;
    }
    const key = `${a}|${b}`;
    const arrow = arrows.get(key) ?? { a, b, count: 0, rules: new Set() };
    arrow.count++;
    arrow.rules.add(link.rule);
    arrows.set(key, arrow);
  }
  const projects = new Map<string, LandscapeProject>();
  for (const ref of code.references) {
    const a = itemOf(ref.from);
    if (!a) {
      continue;
    }
    const b = "pj_" + (ref.to.rel === "." ? "root" : ref.to.rel.replace(/[^A-Za-z0-9]/g, "_"));
    projects.set(b, ref.to);
    const key = `${a}|${b}`;
    const arrow = arrows.get(key) ?? { a, b, count: 0, rules: new Set() };
    arrow.count++;
    arrow.rules.add(ref.rule);
    arrows.set(key, arrow);
  }
  const allArrows = [...arrows.values()].sort((x, y) => y.count - x.count || compare(x.a + "|" + x.b, y.a + "|" + y.b));
  const shown = allArrows.slice(0, MAX_ARROWS_PER_VIEW);
  const connected = new Set(shown.flatMap((x) => [x.a, x.b]));

  const where = folder === project.dir ? path.basename(project.dir) : `${path.basename(project.dir)} / ${rel(folder)}`;
  const root = code.sourceRoots.find((r) => r.dir === folder);
  const title = `${where}${root ? ` · source root (${root.rule})` : ""}`;
  const header = shown.length < allArrows.length ? `${title} · ${shown.length} of ${allArrows.length} arrows shown, largest first` : title;
  const lines = ["flowchart LR", `  subgraph frame["${esc(header)}"]`];
  const loose: string[] = [];
  const entriesIn = (dir: string) => [...code.entries.keys()].filter((e) => within(e, dir)).length;

  for (const name of subfolders) {
    const dir = path.join(folder, name);
    const id = idOf(dir);
    const files = inFolder.filter((f) => within(f.path, dir));
    const entryCount = entriesIn(dir);
    const rootRule = code.sourceRoots.find((r) => r.dir === dir || within(r.dir, dir))?.rule;
    nodes.set(id, { type: "folder", dir });
    tooltips.set(id, [rel(dir) + "/", `${files.length} files`, rootRule ? `Holds a source root (${rootRule})` : undefined, "Click to open"].filter(Boolean).join("\n"));
    const marks = [entryCount ? `▸ ${entryCount} entr${entryCount > 1 ? "ies" : "y"} inside` : "", rootRule ? "source root" : ""].filter(Boolean).join(" · ");
    lines.push(
      `  ${id}["<small>FOLDER</small><br/><b>${esc(name)}/</b><br/><small>${esc(composition(files))}</small>${marks ? `<br/><small>${marks}</small>` : ""}"]${entryCount ? ":::entry" : ""}`
    );
    loose.push(id);
  }
  for (const file of shownFiles) {
    const id = idOf(file);
    const entry = code.entries.get(file);
    const explorable = isCode(file);
    const test = code.testFiles.has(file);
    nodes.set(id, { type: "file", file, explorable });
    tooltips.set(
      id,
      [
        rel(file),
        entry ? `Entry point: ${entry}` : undefined,
        test ? "Test file: its imports are not drawn (classDiagram.includeTestFiles)" : undefined,
        explorable ? "Click to explore its classes" : "Click to open",
      ]
        .filter(Boolean)
        .join("\n")
    );
    lines.push(
      `  ${id}["<small>${entry ? "ENTRY" : test ? "TEST" : "FILE"}</small><br/><b>${esc(path.basename(file))}</b>${entry ? `<br/><small>${esc(entry)}</small>` : ""}"]${entry ? ":::entry" : test ? ":::plain" : ""}`
    );
    loose.push(id);
  }
  if (moreFiles.length) {
    nodes.set("more", { type: "files", files: moreFiles });
    tooltips.set("more", "Code files beyond the first " + MAX_FILE_BOXES + "\nClick to pick one");
    lines.push(`  more["<small>FILES</small><br/><b>${moreFiles.length} more code files</b>"]`);
    loose.push("more");
  }
  if (otherFiles.length) {
    nodes.set("other", { type: "files", files: otherFiles });
    tooltips.set("other", "Files no language pack reads\nClick to open one");
    const names = otherFiles.slice(0, 8).map((f) => path.basename(f));
    const rows: string[] = [];
    for (let i = 0; i < names.length; i += 4) {
      rows.push(names.slice(i, i + 4).map(esc).join(" · "));
    }
    lines.push(
      `  other["<small>OTHER FILES</small><br/><b>${otherFiles.length} file${otherFiles.length > 1 ? "s" : ""}</b><br/><small>${rows.join("<br/>")}${otherFiles.length > names.length ? " …" : ""}</small>"]:::plain`
    );
    loose.push("other");
  }
  const top = folder === shownFolder(code, code.start) || folder === project.dir;
  if (top) {
    nodes.set("projectFiles", { type: "project-files", project });
    const outsideRoot = folder !== project.dir;
    tooltips.set(
      "projectFiles",
      `${project.kind}: ${project.rel}\nFound ${project.markers.map((m) => m.file).join(" · ")}\nClick to open a project file${outsideRoot ? " or the project folder" : ""}`
    );
    lines.push(
      `  projectFiles["<small>${esc(project.kind.toUpperCase())}</small><br/><b>${esc(project.markers.map((m) => m.file).join(" · "))}</b>${outsideRoot ? "<br/><small>project folder ↑</small>" : ""}"]:::plain`
    );
    loose.push("projectFiles");
  }
  if (nodes.size === (top ? 1 : 0)) {
    lines.push(`  empty["<small>NO FILES</small><br/><b>Nothing here</b>"]:::plain`);
  }
  const unconnected = loose.filter((id) => !connected.has(id));
  const grid: string[] = [];
  for (let i = 0; i < unconnected.length; i += GRID_ROW) {
    const chunk = unconnected.slice(i, i + GRID_ROW);
    if (chunk.length > 1) {
      grid.push(`  ${chunk.join(" ~~~ ")}`);
    }
    if (i + GRID_ROW < unconnected.length) {
      grid.push(`  ${unconnected[i]} ~~~ ${unconnected[i + GRID_ROW]}`);
    }
  }
  lines.push("  end");
  for (const [id, target] of [...outside].sort((x, y) => compare(x[0], y[0]))) {
    if (connected.has(id)) {
      const isFile = code.files.some((f) => f.path === target);
      nodes.set(id, isFile ? { type: "file", file: target, explorable: isCode(target) } : { type: "folder", dir: target });
      tooltips.set(id, `${rel(target)}${isFile ? "" : "/"}\nOutside this folder: click to go to it`);
      lines.push(`  ${id}["<small>OUTSIDE THIS FOLDER</small><br/><b>${esc(rel(target))}${isFile ? "" : "/"}</b>"]:::outside`);
    }
  }
  for (const [id, other] of [...projects].sort((x, y) => compare(x[0], y[0]))) {
    if (connected.has(id)) {
      nodes.set(id, { type: "project", project: other });
      tooltips.set(id, `${other.rel}\nAnother project (${other.kind}): click to open it`);
      lines.push(`  ${id}["<small>PROJECT</small><br/><b>${esc(other.name ?? path.basename(other.dir))}</b>"]:::outside`);
    }
  }
  for (const x of shown) {
    lines.push(`  ${x.a} -- "${x.count}" --> ${x.b}`);
  }
  lines.push(
    ...grid,
    "  classDef default fill:#ffffff,stroke:#94a3b8,color:#0f172a",
    "  classDef entry fill:#f0fdf4,stroke:#16a34a,color:#14532d",
    "  classDef plain fill:#fafafa,stroke:#d4d4d8,color:#52525b,stroke-dasharray:4 3",
    "  classDef outside fill:#f8fafc,stroke:#cbd5e1,color:#64748b,stroke-dasharray:2 2"
  );
  return { mermaid: lines.join("\n") + "\n", folder, nodes, tooltips, arrows: { shown: shown.length, total: allArrows.length } };
}
