/**
 * Renders one level of a landscape (the scanned folder, or one project) as a
 * Mermaid flowchart, applying the presentation rules in rules.ts. No `vscode`
 * dependency.
 */
import * as path from "path";
import { GRID_ROW, MAX_ARROWS_PER_VIEW } from "./rules";
import { LandscapeFile, LandscapeModel, LandscapeProject } from "./scan";

export type NodeTarget =
  | { type: "project"; project: LandscapeProject; nested: number }
  | { type: "folders"; folders: string[] }
  | { type: "external"; project: LandscapeProject };

export interface LandscapeView {
  mermaid: string;
  /** Mermaid node id -> what clicking it means. */
  nodes: Map<string, NodeTarget>;
  /** Mermaid node id -> hover text (which rule produced the box). */
  tooltips: Map<string, string>;
  arrows: { shown: number; total: number };
}

interface Arrow {
  a: string;
  b: string;
  count: number;
  rules: Set<string>;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const esc = (s: string) => s.replace(/"/g, "'").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function composition(files: LandscapeFile[], top = 3): string {
  const byExt = new Map<string, number>();
  files.forEach((f) => byExt.set(f.ext, (byExt.get(f.ext) ?? 0) + 1));
  return [...byExt]
    .sort((x, y) => y[1] - x[1] || compare(x[0], y[0]))
    .slice(0, top)
    .map(([ext, n]) => `${n.toLocaleString("en-US")} ${ext}`)
    .join(" · ");
}

const within = (p: string, dir: string) => p.startsWith(dir + path.sep);

/**
 * @param container the scanned root, or the dir of a project to look inside
 */
export function renderLandscapeView(model: LandscapeModel, container: string): LandscapeView {
  const atRoot = container === model.root;
  const containerProject = model.projects.find((p) => p.dir === container);

  // Rule 5: the projects one level down; deeper ones are summed onto them.
  const level = model.projects.filter(
    (p) => within(p.dir, container) && (p.parent === undefined || p.parent.dir === container || !within(p.parent.dir, container))
  );
  const topOf = (p: LandscapeProject) => level.find((l) => l === p || within(p.dir, l.dir));
  const nestedCount = (p: LandscapeProject) => model.projects.filter((o) => within(o.dir, p.dir)).length;

  // Stable, unique Mermaid ids from paths.
  const ids = new Map<LandscapeProject, string>();
  const used = new Set<string>();
  const idOf = (p: LandscapeProject) => {
    let id = ids.get(p);
    if (!id) {
      const base = "p_" + (p.rel === "." ? "root" : p.rel.replace(/[^A-Za-z0-9]/g, "_"));
      id = base;
      for (let n = 2; used.has(id); n++) {
        id = `${base}_${n}`;
      }
      used.add(id);
      ids.set(p, id);
    }
    return id;
  };
  model.projects.forEach(idOf); // assign in sorted order, so ids are deterministic

  const nodes = new Map<string, NodeTarget>();
  const tooltips = new Map<string, string>();

  // Arrows summed onto this level; projects outside the container appear as external boxes.
  const arrows = new Map<string, Arrow>();
  const externals = new Map<string, LandscapeProject>();
  for (const edge of model.edges) {
    const a = topOf(edge.from);
    const b = topOf(edge.to);
    let from: string | undefined;
    let to: string | undefined;
    if (a && b && a !== b) {
      [from, to] = [idOf(a), idOf(b)];
    } else if (containerProject && edge.from === containerProject && b) {
      // Inside a project, its own files are the "files in this folder" box.
      [from, to] = ["plain", idOf(b)];
    } else if (containerProject && edge.to === containerProject && a) {
      [from, to] = [idOf(a), "plain"];
    } else if (a && !b && !within(edge.to.dir, container) && edge.to !== containerProject) {
      [from, to] = [idOf(a), `ext_${idOf(edge.to)}`];
      externals.set(to, edge.to);
    } else if (!a && b && !within(edge.from.dir, container) && edge.from !== containerProject) {
      [from, to] = [`ext_${idOf(edge.from)}`, idOf(b)];
      externals.set(from, edge.from);
    }
    if (from && to) {
      const key = `${from}|${to}`;
      const arrow = arrows.get(key) ?? { a: from, b: to, count: 0, rules: new Set() };
      arrow.count += edge.count;
      arrow.rules.add(edge.rule);
      arrows.set(key, arrow);
    }
  }
  // Rule 7: at most MAX_ARROWS_PER_VIEW, largest first, ties by ids.
  const allArrows = [...arrows.values()].sort((x, y) => y.count - x.count || compare(x.a + "|" + x.b, y.a + "|" + y.b));
  const shown = allArrows.slice(0, MAX_ARROWS_PER_VIEW);
  const connected = new Set(shown.flatMap((x) => [x.a, x.b]));

  const markerList = (p: LandscapeProject) => p.markers.map((m) => m.file).join(" · ");
  const title = atRoot
    ? `${path.basename(model.root)}${containerProject ? ` · this folder: ${markerList(containerProject)}` : ""}`
    : `${containerProject ? path.basename(containerProject.dir) : path.basename(container)}${containerProject ? ` · ${markerList(containerProject)}` : ""}`;
  const header = shown.length < allArrows.length ? `${title} · ${shown.length} of ${allArrows.length} arrows shown, largest first` : title;

  const lines = ["flowchart LR", `  subgraph frame["${esc(header)}"]`];
  const grid: string[] = [];
  const gridRows = (row: string[]) => {
    for (let i = 0; i < row.length; i += GRID_ROW) {
      const chunk = row.slice(i, i + GRID_ROW);
      if (chunk.length > 1) {
        grid.push(`  ${chunk.join(" ~~~ ")}`);
      }
      if (i + GRID_ROW < row.length) {
        grid.push(`  ${row[i]} ~~~ ${row[i + GRID_ROW]}`);
      }
    }
  };

  const filesOf = (p: LandscapeProject) => model.files.filter((f) => within(f.path, p.dir));
  const box = (p: LandscapeProject) => {
    const id = idOf(p);
    const nested = nestedCount(p);
    nodes.set(id, { type: "project", project: p, nested });
    const base = path.basename(p.dir);
    const shownName = p.name && p.name !== base ? `<br/><small>${esc(p.name)}</small>` : "";
    const comp = atRoot ? `<br/><small>${esc(composition(filesOf(p)))}</small>` : "";
    const inside = nested ? `<br/><small>▸ ${nested} project${nested > 1 ? "s" : ""} inside</small>` : "";
    tooltips.set(
      id,
      [
        `${p.rel}`,
        `Project: found ${markerList(p)}`,
        `Labelled "${p.kind}" by rule ${p.markers[0].rule.pattern}`,
        p.name ? `Name from ${p.nameSource}` : undefined,
        nested ? `Click to open (${nested} projects inside)` : "Click for actions",
      ]
        .filter(Boolean)
        .join("\n")
    );
    return `  ${id}["<small>${esc(p.kind.toUpperCase())}</small><br/><b>${esc(atRoot ? p.rel : base)}</b>${shownName}${comp}${inside}"]`;
  };

  // Group by parent folder; a folder holding a single project is not a group.
  const groups = new Map<string, LandscapeProject[]>();
  for (const p of level) {
    const g = path.relative(container, path.dirname(p.dir)).split(path.sep).join("/");
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  for (const [g, members] of [...groups]) {
    if (g && members.length === 1) {
      groups.delete(g);
      groups.set("", [...(groups.get("") ?? []), ...members]);
    }
  }
  let ungroupedLoose: string[] = [];
  for (const [g, members] of [...groups].sort((x, y) => compare(x[0], y[0]))) {
    members.sort((x, y) => compare(x.rel, y.rel));
    if (g) {
      lines.push(`  subgraph g_${g.replace(/[^A-Za-z0-9]/g, "_")}["${esc(g)}/"]`);
    }
    lines.push(...members.map(box));
    const loose = members.map(idOf).filter((id) => !connected.has(id));
    if (g) {
      lines.push("  end");
      gridRows(loose);
    } else {
      ungroupedLoose = loose;
    }
  }

  // Rule 6: everything in the container not owned by a project below it.
  const plain = new Map<string, LandscapeFile[]>();
  for (const f of model.files) {
    if (!within(f.path, container) || (f.owner && f.owner.dir !== container && within(f.owner.dir, container))) {
      continue;
    }
    const parts = path.relative(container, f.path).split(path.sep);
    const key = parts.length > 1 ? `${parts[0]}/` : "(files in this folder)";
    plain.set(key, [...(plain.get(key) ?? []), f]);
  }
  if (plain.size) {
    const names = [...plain.keys()].sort(compare);
    const folders = names.filter((n) => n.endsWith("/"));
    const rows: string[] = [];
    for (let i = 0; i < names.length; i += 4) {
      rows.push(names.slice(i, i + 4).map(esc).join(" · "));
    }
    const heading =
      folders.length === 0
        ? "Files in this folder"
        : `${folders.length} folder${folders.length === 1 ? "" : "s"}${names.length > folders.length ? " + files" : ""}`;
    lines.push(
      `  plain["<small>${containerProject ? "OWN FILES" : "NO PROJECT MARKER"}</small><br/><b>${heading}</b><br/><small>${rows.join("<br/>")}</small><br/><small>${esc(composition([...plain.values()].flat()))}</small>"]:::plain`
    );
    nodes.set("plain", { type: "folders", folders: folders.map((f) => path.join(container, f)) });
    tooltips.set(
      "plain",
      containerProject
        ? `Files of ${containerProject.rel} that are not in a project inside it (rule 6)\nClick to reveal a folder in the Explorer`
        : "Folders with no project marker file (rule 6)\nClick to reveal one in the Explorer"
    );
  }
  gridRows([...(plain.size ? ["plain"] : []), ...ungroupedLoose]);
  lines.push("  end");

  for (const [id, p] of [...externals].sort((x, y) => compare(x[0], y[0]))) {
    if (connected.has(id)) {
      lines.push(`  ${id}["<small>OUTSIDE THIS VIEW</small><br/><b>${esc(p.rel)}</b>"]:::outside`);
      nodes.set(id, { type: "external", project: p });
      tooltips.set(id, `${p.rel}\nOutside this view: click to go to it`);
    }
  }
  for (const x of shown) {
    lines.push(`  ${x.a} -- "${x.count}" --> ${x.b}`);
  }
  lines.push(
    ...grid,
    "  classDef default fill:#ffffff,stroke:#94a3b8,color:#0f172a",
    "  classDef plain fill:#fafafa,stroke:#d4d4d8,color:#52525b,stroke-dasharray:4 3",
    "  classDef outside fill:#f8fafc,stroke:#cbd5e1,color:#64748b,stroke-dasharray:2 2"
  );
  return { mermaid: lines.join("\n") + "\n", nodes, tooltips, arrows: { shown: shown.length, total: allArrows.length } };
}
