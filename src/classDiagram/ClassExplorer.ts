/**
 * "Explore classes from here": a view that starts with the classes of one file
 * and grows as you click. Lit classes are drawn in full; the classes one step
 * away (the frontier) are drawn as dashed boxes you can click to light up.
 *
 * Free of any `vscode` dependency; CodeExplorerCommand drives it. Two sources
 * implement ExplorerGraph: ClassGraph (our TypeScript analysis, below) and
 * ProviderGraph (answers from the installed language extension).
 */
import {
  ClassModel,
  compare,
  Edge,
  edgeLine,
  Entry,
  escapeText,
  FOCUS_STYLE,
  folderOf,
  renderBlock,
} from "./ClassDiagramGenerator";

/** The four directions you can see from a class. */
export type Direction = "up" | "down" | "out" | "in";

export const DIRECTION_LABELS: Record<Direction, string> = {
  up: "supertypes",
  down: "subtypes",
  out: "used classes",
  in: "consumers",
};

const DIRECTIONS: Direction[] = ["up", "down", "out", "in"];

/** Frontier boxes per lit class and direction before the rest are collapsed. */
export const DEFAULT_BUDGET = 8;

/**
 * Member lines shown per lit class. A class with ~100 members would otherwise
 * dwarf everything around it; the full list is one click away (open source).
 */
export const MAX_MEMBERS = 14;

const FRONTIER_STYLE = (id: string) => `style ${id} fill:#f4f4f5,stroke:#a1a1aa,stroke-dasharray:4 3,color:#52525b`;
const OVERFLOW_STYLE = (id: string) => `style ${id} fill:#fafafa,stroke:#d4d4d8,stroke-dasharray:2 2,color:#71717a`;

export interface Neighbour {
  direction: Direction;
  id: string;
}

/** What the explorer view needs from a source of classes. */
export interface ExplorerGraph {
  /** Can be lit up (defined in the explored code, not only referenced). */
  has(id: string): boolean;
  name(id: string): string;
  /** Folder relative to the root, `/`-separated. */
  folder(id: string): string;
  /** Neighbours of a lit class; complete once `expand(id)` has resolved. */
  neighbours(id: string): Neighbour[];
  /** Loads what is one step away from `id` (a no-op for sources analysed up front). */
  expand(id: string): Promise<void>;
  /** The given ids in diagram output order. */
  order(ids: Set<string>): string[];
  /** The Mermaid block for a lit class (full members) or a frontier class (name, kind, folder). */
  block(id: string, lit: boolean): string;
  /** Every known arrow. */
  edges(): Edge[];
  /** Where a class is declared (1-based line). */
  location(id: string): { file: string; line: number } | undefined;
  /** Hover text for a box, if any. */
  tooltip?(id: string): string | undefined;
  /** Notes shown under the view, e.g. which fallback rules answered. */
  notes?(): string[];
}

/** The TypeScript model (ts-morph analysis) indexed for explorer queries. */
export class ClassGraph implements ExplorerGraph {
  readonly byId: Map<string, Entry>;
  private readonly adjacency = new Map<string, Neighbour[]>();

  constructor(readonly model: ClassModel, readonly root: string) {
    this.byId = new Map(model.entries.map((e) => [e.id, e]));
    for (const edge of model.edges) {
      const [fromDirection, toDirection]: [Direction, Direction] =
        edge.kind === "inherits" || edge.kind === "realizes"
          ? ["down", "up"] // edge.from is the parent: from sees `to` below, `to` sees `from` above
          : ["out", "in"]; // edge.from uses edge.to
      this.link(edge.from, { direction: fromDirection, id: edge.to });
      this.link(edge.to, { direction: toDirection, id: edge.from });
    }
  }

  private link(id: string, neighbour: Neighbour) {
    if (neighbour.id !== id) {
      this.adjacency.set(id, [...(this.adjacency.get(id) ?? []), neighbour]);
    }
  }

  neighbours(id: string): Neighbour[] {
    return this.adjacency.get(id) ?? [];
  }

  /** Ids of the declarations in a file, in source order. */
  idsInFile(filePath: string, sameFile: (a: string, b: string) => boolean): string[] {
    return this.model.entries.filter((e) => sameFile(e.node.getSourceFile().getFilePath(), filePath)).map((e) => e.id);
  }

  /**
   * Ids of the declarations a file exports from other files (`export * from`,
   * `export { X } from`), in diagram order: what a barrel such as public-api.ts
   * stands for when it declares nothing itself.
   */
  idsReexportedBy(filePath: string, sameFile: (a: string, b: string) => boolean): string[] {
    const project = this.model.entries[0]?.node.getProject();
    const file = project?.getSourceFiles().find((f) => sameFile(f.getFilePath(), filePath));
    if (!file) {
      return [];
    }
    const ids = new Map<unknown, string>(this.model.entries.map((e) => [e.node, e.id]));
    const out = new Set<string>();
    for (const declarations of file.getExportedDeclarations().values()) {
      for (const declaration of declarations) {
        const id = ids.get(declaration);
        if (id) {
          out.add(id);
        }
      }
    }
    return this.order(out);
  }

  folder(id: string): string {
    const entry = this.byId.get(id);
    return entry ? folderOf(entry.node, this.root) : "";
  }

  name(id: string): string {
    return this.byId.get(id)?.name ?? [...this.model.externalIds].find(([, x]) => x === id)?.[0] ?? id;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  async expand(): Promise<void> {}

  order(ids: Set<string>): string[] {
    return [
      ...this.model.entries.filter((e) => ids.has(e.id)).map((e) => e.id),
      ...[...this.model.externalIds.values()].filter((id) => ids.has(id)),
    ];
  }

  block(id: string, lit: boolean): string {
    const entry = this.byId.get(id);
    if (!entry) {
      const name = this.name(id);
      return [`  class ${id}${id !== name ? `["${escapeText(name)}"]` : ""} {`, "    <<external>>", "  }"].join("\n");
    }
    return lit ? renderBlock(entry, "full") : frontierBlock(entry, shortFolder(this.folder(id)));
  }

  edges(): Edge[] {
    return this.model.edges;
  }

  location(id: string) {
    const entry = this.byId.get(id);
    return entry ? { file: entry.node.getSourceFile().getFilePath(), line: entry.node.getStartLineNumber() } : undefined;
  }
}

export interface ExplorerState {
  /** Classes shown in full, in the order they were lit. */
  lit: string[];
  /** Where the walk started (outlined). */
  origin: string[];
}

export interface Overflow {
  of: string;
  direction: Direction;
  ids: string[];
}

export interface ExplorerView {
  mermaid: string;
  /** Dashed boxes: clicking one lights it up. */
  frontier: Set<string>;
  /** "+N more" boxes: id -> the classes they stand for. */
  overflow: Map<string, Overflow>;
}

export function renderExplorerView(graph: ExplorerGraph, state: ExplorerState, budget = DEFAULT_BUDGET): ExplorerView {
  const lit = new Set(state.lit.filter((id) => graph.has(id)));
  const frontier = new Set<string>();
  const overflow = new Map<string, Overflow>();

  for (const id of lit) {
    for (const direction of DIRECTIONS) {
      const candidates = [
        ...new Set(graph.neighbours(id).filter((n) => n.direction === direction && !lit.has(n.id)).map((n) => n.id)),
      ].sort((a, b) => compare(graph.name(a), graph.name(b)));
      candidates.slice(0, budget).forEach((c) => frontier.add(c));
      if (candidates.length > budget) {
        overflow.set(`more_${id}_${direction}`, { of: id, direction, ids: candidates.slice(budget) });
      }
    }
  }
  // A class collapsed for one lit class may be shown anyway for another.
  for (const [key, group] of overflow) {
    group.ids = group.ids.filter((c) => !frontier.has(c));
    if (group.ids.length === 0) {
      overflow.delete(key);
    }
  }

  const lines = ["classDiagram"];
  for (const id of graph.order(new Set([...lit, ...frontier]))) {
    lines.push(lit.has(id) ? capMembers(graph.block(id, true)) : graph.block(id, false));
  }
  for (const [id, group] of overflow) {
    lines.push(`  class ${id}["+${group.ids.length} more ${DIRECTION_LABELS[group.direction]}"]`);
  }

  // Arrows between lit classes, and from lit classes to the frontier.
  const shown = new Set([...lit, ...frontier]);
  const edges = graph.edges().filter(
    (e: Edge) => shown.has(e.from) && shown.has(e.to) && (lit.has(e.from) || lit.has(e.to))
  );
  const edgeLines = edges.map(edgeLine);
  for (const [id, group] of overflow) {
    edgeLines.push(`  ${group.of} .. ${id}`);
  }

  const styles = [
    ...state.origin.filter((id) => lit.has(id)).map(FOCUS_STYLE),
    ...[...frontier].map(FRONTIER_STYLE),
    ...[...overflow.keys()].map(OVERFLOW_STYLE),
  ].map((s) => `  ${s}`);

  return { mermaid: [...lines, ...edgeLines.sort(), ...styles, ""].join("\n"), frontier, overflow };
}

function capMembers(block: string): string {
  const [header, ...rest] = block.split("\n");
  const closing = rest.pop()!;
  const annotations = rest.filter((l) => l.trim().startsWith("<<"));
  const members = rest.filter((l) => !l.trim().startsWith("<<"));
  if (members.length <= MAX_MEMBERS) {
    return block;
  }
  const hidden = members.length - (MAX_MEMBERS - 1);
  return [header, ...annotations, ...members.slice(0, MAX_MEMBERS - 1), `    … ${hidden} more members`, closing].join("\n");
}

/** `a/b/c/d` -> `…/c/d`: enough to place a class without a very wide box. */
export function shortFolder(folder: string): string {
  const parts = folder.split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : parts.join("/");
}

/** A name-only box labelled with its folder (and kind, e.g. interface). */
function frontierBlock(entry: Entry, folder: string): string {
  const [header, ...rest] = renderBlock(entry, "names").split("\n");
  const kind = rest.find((l) => l.trim().startsWith("<<"))?.trim().slice(2, -2);
  const annotation = [kind, folder].filter(Boolean).join(" · ");
  return [header, ...(annotation ? [`    <<${escapeText(annotation)}>>`] : []), "  }"].join("\n");
}
