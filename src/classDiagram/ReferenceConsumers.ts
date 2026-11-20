/**
 * Phase 3: TypeScript "in" from every reference. Wraps our own analysis
 * (ClassGraph: boxes, members, up, down, out) and adds, per lit class, the
 * consumers found by the language extension's references: each reference's
 * consumer is the innermost analysed declaration around it (references
 * outside any declaration, such as imports, are not drawn; test files are not
 * analysed, so they do not count unless included). Pairs already linked by
 * the analysis (fields, injection, inheritance) keep their arrow.
 *
 * Used when `classDiagram.explorerConsumers` is "references". No `vscode`
 * dependency: answers come through Providers.
 */
import * as path from "path";
import { Node as MorphNode } from "ts-morph";
import { compare, Edge } from "./ClassDiagramGenerator";
import { ClassGraph, ExplorerGraph, Neighbour } from "./ClassExplorer";
import { Loc, MAX_REFERENCE_FILES, Pos, Providers } from "./ProviderGraph";

interface Extent {
  id: string;
  file: string;
  start: number;
  end: number;
}

export class WithReferenceConsumers implements ExplorerGraph {
  private readonly extra = new Map<string, Neighbour[]>();
  private readonly extraEdges = new Map<string, Edge>();
  private readonly expanded = new Map<string, Promise<void>>();
  private readonly linked: Set<string>;
  private extents?: Map<string, Extent[]>;

  constructor(
    readonly base: ClassGraph,
    private readonly providers: Providers,
    private readonly inWorkspace: (file: string) => boolean = () => true
  ) {
    // Pairs the analysis already links, in either direction.
    this.linked = new Set(base.edges().flatMap((e) => [`${e.from}|${e.to}`, `${e.to}|${e.from}`]));
  }

  has(id: string) {
    return this.base.has(id);
  }
  name(id: string) {
    return this.base.name(id);
  }
  folder(id: string) {
    return this.base.folder(id);
  }
  order(ids: Set<string>) {
    return this.base.order(ids);
  }
  block(id: string, lit: boolean) {
    return this.base.block(id, lit);
  }
  location(id: string) {
    return this.base.location(id);
  }

  neighbours(id: string): Neighbour[] {
    return [...this.base.neighbours(id), ...(this.extra.get(id) ?? [])];
  }

  edges(): Edge[] {
    return [...this.base.edges(), ...this.extraEdges.values()];
  }

  notes(): string[] {
    return ["in: every reference, from the TypeScript language extension (classDiagram.explorerConsumers)"];
  }

  expand(id: string): Promise<void> {
    let work = this.expanded.get(id);
    if (!work) {
      work = this.load(id);
      this.expanded.set(id, work);
      work.catch(() => this.expanded.delete(id));
    }
    return work;
  }

  /** Every analysed declaration's span, by file (offsets in the file's text). */
  private extentsByFile(): Map<string, Extent[]> {
    if (!this.extents) {
      this.extents = new Map();
      for (const entry of this.base.model.entries) {
        const file = path.resolve(entry.node.getSourceFile().getFilePath());
        const list = this.extents.get(file) ?? [];
        list.push({ id: entry.id, file, start: entry.node.getStart(), end: entry.node.getEnd() });
        this.extents.set(file, list);
      }
    }
    return this.extents;
  }

  private async load(id: string): Promise<void> {
    const entry = this.base.byId.get(id);
    if (!entry) {
      return;
    }
    const nameNode = (entry.node as unknown as { getNameNode?: () => MorphNode | undefined }).getNameNode?.() ?? entry.node;
    const sourceFile = entry.node.getSourceFile();
    const at = toPos(sourceFile.getLineAndColumnAtPos(nameNode.getStart()));
    let references: Loc[];
    try {
      references = await this.providers.references(sourceFile.getFilePath(), at);
    } catch {
      return; // no answer counts as none
    }
    const extents = this.extentsByFile();
    const files = [...new Set(references.map((r) => path.resolve(r.file)))].filter(this.inWorkspace).sort(compare).slice(0, MAX_REFERENCE_FILES);
    for (const file of files) {
      const inFile = extents.get(file);
      const source = this.base.model.entries.find((e) => path.resolve(e.node.getSourceFile().getFilePath()) === file)?.node.getSourceFile();
      if (!inFile || !source) {
        continue; // not analysed (test files, outside the project)
      }
      for (const ref of references.filter((r) => path.resolve(r.file) === file)) {
        const offset = source.compilerNode.getPositionOfLineAndCharacter(ref.range.start.line, ref.range.start.character);
        const consumer = inFile
          .filter((x) => offset >= x.start && offset < x.end)
          .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
        if (!consumer || consumer.id === id || this.linked.has(`${consumer.id}|${id}`)) {
          continue;
        }
        const list = this.extra.get(id) ?? [];
        if (!list.some((n) => n.id === consumer.id)) {
          list.push({ direction: "in", id: consumer.id });
          this.extra.set(id, list);
          this.extraEdges.set(`${consumer.id}|${id}`, { from: consumer.id, to: id, kind: "dependency", labels: [] });
        }
      }
    }
  }
}

function toPos(lc: { line: number; column: number }): Pos {
  return { line: lc.line - 1, character: lc.column - 1 };
}
