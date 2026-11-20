/**
 * An ExplorerGraph built from the answers of the installed language extension
 * (VS Code's provider commands), loaded one click at a time. No `vscode`
 * dependency: answers come through the Providers interface, so tests replay
 * recorded answers (see vscodeProviders.ts for the live adapter).
 *
 * Rules (deterministic for the same files and extension versions):
 * 1. Boxes: document symbols of kind Class, Struct, Interface or Enum; their
 *    children are their members. A member named `Name(params) : Type` or
 *    `Name : Type` (C#) is split into those parts; a detail that is only a
 *    visibility keyword gives the marker (`-` `#` `+` `~`); a method without
 *    parameters in its name takes them from its child symbols before its body
 *    (PHP). Declared apart (pack.receiver, pack.apart): a method symbol
 *    `(T).M` (Go receivers) or the methods of a block `impl [Trait for] T`
 *    (Rust) belong to type `T` of the same folder; the block's traits are
 *    T's supertypes (up, by definition of their names; down, when a
 *    reference sits in such a header). Functions that are not methods appear
 *    only as consumers.
 *    Namespace, package and module symbols are looked inside.
 * Answers for up, down and out count only where they land on a class's name
 * (TypeScript's "implementations" of a class also include array literals).
 * 2. up: supertypes (type hierarchy). Without a type hierarchy: the
 *    definitions of the names in the class's declaration header (between its
 *    name and its body: `class A extends B implements C {`, `class A : B {`).
 * 3. down: subtypes, else implementations; plus rule 5's header references.
 * 4. out: the type definition of each field; where that finds no class in the
 *    workspace, the definitions of the names in the field's declaration
 *    (from the start of its line: some extensions start a field at its name).
 * 5. in: references to the class; each one's consumer is the innermost class
 *    (or, Go, the method's receiver type, or the function) containing it. A
 *    reference in another class's declaration header makes that class a
 *    subtype (down) instead. References outside any symbol (imports) are not
 *    drawn. At most MAX_REFERENCE_FILES files are resolved per class.
 * 6. Answers outside the workspace (standard libraries, module caches,
 *    ignored folders) and, unless included, test files are dropped.
 */
import * as path from "path";
import { LanguagePack, rulesFor } from "../packs";
import { compare, Edge, EdgeKind, escapeText } from "./ClassDiagramGenerator";
import { Direction, ExplorerGraph, Neighbour, shortFolder } from "./ClassExplorer";

export interface Pos {
  line: number;
  character: number;
}
export interface Span {
  start: Pos;
  end: Pos;
}
export interface Sym {
  name: string;
  /** vscode.SymbolKind name, e.g. "Class", "Struct", "Method". */
  kind: string;
  detail?: string;
  range: Span;
  selectionRange: Span;
  children: Sym[];
}
export interface Loc {
  file: string;
  range: Span;
}

/** The language extension's answers. `undefined` = nothing provides this. */
export interface Providers {
  documentSymbols(file: string): Promise<Sym[]>;
  supertypes(file: string, at: Pos): Promise<Loc[] | undefined>;
  subtypes(file: string, at: Pos): Promise<Loc[] | undefined>;
  implementations(file: string, at: Pos): Promise<Loc[]>;
  definition(file: string, at: Pos): Promise<Loc[]>;
  typeDefinition(file: string, at: Pos): Promise<Loc[]>;
  references(file: string, at: Pos): Promise<Loc[]>;
  /** Files in a folder (Go: the package's other files, for receiver methods). */
  siblings(file: string): Promise<string[]>;
  /** The file's text (declaration headers and field declarations are read from it). */
  text(file: string): Promise<string>;
}

export interface ProviderGraphOptions {
  /** Folder labels are relative to this. */
  root: string;
  /** Rule 6: whether an answer's file counts (inside the workspace, not ignored). */
  inWorkspace: (file: string) => boolean;
  includeTestFiles: boolean;
  /** Names the source in tooltips, e.g. "golang.go 0.58.0". */
  source?: string;
}

export const MAX_REFERENCE_FILES = 50;

/**
 * A question the extension fails to answer counts as no answer: one failing
 * question (gopls rejects "go to type" on a map field) must not break the view.
 */
async function ask<T>(question: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await question();
  } catch {
    return fallback;
  }
}

const TYPE_KINDS = new Set(["Class", "Struct", "Interface", "Enum"]);
const CONTAINER_KINDS = new Set(["Namespace", "Package", "Module", "File"]);
/** A type's direct children of these kinds are its fields (a variable or constant declared in a type is a member: Python attributes, class constants). */
const FIELD_KINDS = new Set(["Field", "Property", "EnumMember", "Variable", "Constant"]);
const METHOD_KINDS = new Set(["Method", "Function", "Constructor"]);
/** Test files per the file's language pack. */
const isTestFile = (file: string) => rulesFor(file).testFile?.test(file) ?? false;
/** Files of the same language (a package's other files, for receiver methods). */
const sameLanguage = (a: string, b: string) => rulesFor(a) === rulesFor(b);

/** What a folder declares apart from one type: methods (Go receivers, block children) and blocks (Rust `impl`). */
interface Apart {
  methods: { name: string; sym: Sym; file: string }[];
  blocks: { sym: Sym; file: string; supertypes: string[] }[];
}

interface Node {
  id: string;
  name: string;
  /** "struct", "interface", "enum", "type" (other named types), "function". */
  kind: string;
  file: string;
  sym: Sym;
  fields: Sym[];
  methods: { name: string; sym: Sym; params?: string[] }[];
}

const contains = (span: Span, at: Pos) =>
  (at.line > span.start.line || (at.line === span.start.line && at.character >= span.start.character)) &&
  (at.line < span.end.line || (at.line === span.end.line && at.character <= span.end.character));
const size = (span: Span) => (span.end.line - span.start.line) * 100000 + (span.end.character - span.start.character);

export class ProviderGraph implements ExplorerGraph {
  private readonly nodes = new Map<string, Node>();
  /** file -> its nodes (types and functions), in source order. */
  private readonly files = new Map<string, Promise<Node[]>>();
  /** Folder -> what is declared apart from types (Go receivers, Rust impl blocks), by type name. */
  private readonly apartByFolder = new Map<string, Promise<Map<string, Apart>>>();
  private readonly byKey = new Map<string, Node>();
  private readonly usedIds = new Set<string>();
  private readonly adjacency = new Map<string, Neighbour[]>();
  private readonly edgeMap = new Map<string, Edge>();
  private readonly expanded = new Map<string, Promise<void>>();
  /** Which fallback rules answered something (shown in the panel). */
  private readonly fallbacks = new Set<string>();
  /** Per lit class: references that were not resolved (over the file cap). */
  private readonly unresolved = new Map<string, number>();

  constructor(private readonly providers: Providers, private readonly options: ProviderGraphOptions) {}

  /** The classes declared in `file` (rule 1), or its functions when it has none. */
  async start(file: string): Promise<string[]> {
    const nodes = await this.nodesIn(file);
    const types = nodes.filter((n) => n.kind !== "function");
    return (types.length ? types : nodes).map((n) => n.id);
  }

  // ---------------------------------------------------------------------------
  // ExplorerGraph

  has(id: string): boolean {
    return this.nodes.has(id);
  }

  name(id: string): string {
    return this.nodes.get(id)?.name ?? id;
  }

  folder(id: string): string {
    const node = this.nodes.get(id);
    if (!node) {
      return "";
    }
    const relative = path.relative(this.options.root, path.dirname(node.file));
    return relative.startsWith("..") ? "" : relative.split(path.sep).join("/");
  }

  neighbours(id: string): Neighbour[] {
    return this.adjacency.get(id) ?? [];
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

  order(ids: Set<string>): string[] {
    // Registration order is the walk order: deterministic for the same clicks.
    return [...this.nodes.keys()].filter((id) => ids.has(id));
  }

  block(id: string, lit: boolean): string {
    const node = this.nodes.get(id)!;
    const header = `  class ${node.id}${node.id !== node.name ? `["${escapeText(node.name)}"]` : ""} {`;
    const kind = node.kind === "struct" ? undefined : node.kind === "enum" ? "enumeration" : node.kind;
    if (!lit) {
      const annotation = [kind, shortFolder(this.folder(id))].filter(Boolean).join(" · ");
      return [header, ...(annotation ? [`    <<${escapeText(annotation)}>>`] : []), "  }"].join("\n");
    }
    const pack = rulesFor(node.file);
    const members = [
      ...node.fields.map((f) => `    ${pack.member(f, false)}`),
      ...node.methods.map((m) => `    ${pack.member(m.sym, true, m.params, m.name)}`),
    ];
    return [header, ...(kind ? [`    <<${kind}>>`] : []), ...members, "  }"].join("\n");
  }

  edges(): Edge[] {
    return [...this.edgeMap.values()];
  }

  location(id: string) {
    const node = this.nodes.get(id);
    return node ? { file: node.file, line: node.sym.selectionRange.start.line + 1 } : undefined;
  }

  /** Notes for the panel: where answers came from a fallback rule. */
  notes(): string[] {
    return [...this.fallbacks].sort(compare);
  }

  tooltip(id: string): string | undefined {
    const node = this.nodes.get(id);
    if (!node) {
      return undefined;
    }
    const unresolved = this.unresolved.get(id);
    return [
      `${node.kind} ${node.name}`,
      `${path.relative(this.options.root, node.file).split(path.sep).join("/")}:${node.sym.selectionRange.start.line + 1}`,
      this.options.source ? `From ${this.options.source}` : undefined,
      unresolved ? `${unresolved} more referencing files not resolved (limit ${MAX_REFERENCE_FILES})` : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // ---------------------------------------------------------------------------
  // Loading

  private counts(file: string): boolean {
    return this.options.inWorkspace(file) && (this.options.includeTestFiles || !isTestFile(file));
  }

  /** Rule 1 for one file. */
  private nodesIn(file: string): Promise<Node[]> {
    let work = this.files.get(file);
    if (!work) {
      work = (async () => {
        const symbols = await ask(() => this.providers.documentSymbols(file), []);
        const pack = rulesFor(file);
        const apart = pack.receiver || pack.apart ? await this.declaredApart(file) : new Map<string, Apart>();
        const nodes: Node[] = [];
        const visit = (sym: Sym) => {
          if (TYPE_KINDS.has(sym.kind)) {
            const declaredApart = (apart.get(sym.name)?.methods ?? []).map((m) => ({ name: m.name, sym: m.sym }));
            nodes.push(
              this.register(file, sym, kindOf(sym, pack), {
                fields: sym.children.filter((c) => FIELD_KINDS.has(c.kind)),
                methods: [
                  ...sym.children.filter((c) => METHOD_KINDS.has(c.kind)).map((c) => ({ name: c.name, sym: c })),
                  ...declaredApart,
                ],
              })
            );
            sym.children.filter((c) => TYPE_KINDS.has(c.kind)).forEach(visit);
          } else if (sym.kind === "Function") {
            nodes.push(this.register(file, sym, "function", { fields: [], methods: [] }));
          } else if (CONTAINER_KINDS.has(sym.kind)) {
            sym.children.forEach(visit);
          }
        };
        symbols.forEach(visit);
        // Methods without parameters in their name: their child symbols before the body opens.
        const text = nodes.some((n) => n.methods.some((m) => !m.sym.name.includes("(") && m.sym.children.length)) ? await this.text(file) : "";
        if (text) {
          const lines = text.split("\n");
          for (const n of nodes) {
            for (const m of n.methods) {
              if (!m.sym.name.includes("(") && m.sym.children.length) {
                const from = offsetOf(lines, m.sym.selectionRange.end);
                const body = text.slice(from).search(/[{;]/);
                const end = body < 0 ? text.length : from + body;
                m.params = m.sym.children
                  .filter((c) => c.kind === "Variable" && offsetOf(lines, c.range.start) < end)
                  .map((c) => c.name);
              }
            }
          }
        }
        return nodes;
      })();
      this.files.set(file, work);
      work.catch(() => this.files.delete(file));
    }
    return work;
  }

  /**
   * Declared apart from their type, across the file's folder, by type name:
   * receiver methods (pack.receiver, Go) and blocks (pack.apart, Rust `impl`).
   */
  private declaredApart(file: string): Promise<Map<string, Apart>> {
    const dir = path.dirname(file);
    let work = this.apartByFolder.get(dir);
    if (!work) {
      work = (async () => {
        const byType = new Map<string, Apart>();
        const entry = (type: string) => {
          let a = byType.get(type);
          if (!a) {
            a = { methods: [], blocks: [] };
            byType.set(type, a);
          }
          return a;
        };
        const pack = rulesFor(file);
        const files = (await ask(() => this.providers.siblings(file), [file]))
          .filter((f) => sameLanguage(f, file) && (this.options.includeTestFiles || !isTestFile(f)))
          .sort(compare);
        for (const f of files) {
          const visit = (sym: Sym) => {
            const method = pack.receiver?.(sym.name);
            if (method) {
              entry(method.type).methods.push({ name: method.method, sym, file: f });
              return;
            }
            const block = TYPE_KINDS.has(sym.kind) ? undefined : pack.apart?.(sym.name);
            if (block) {
              const a = entry(block.type);
              a.blocks.push({ sym, file: f, supertypes: block.supertypes });
              a.methods.push(...sym.children.filter((c) => METHOD_KINDS.has(c.kind)).map((c) => ({ name: c.name, sym: c, file: f })));
            } else if (CONTAINER_KINDS.has(sym.kind)) {
              sym.children.forEach(visit);
            }
          };
          (await ask(() => this.providers.documentSymbols(f), [])).forEach(visit);
        }
        return byType;
      })();
      this.apartByFolder.set(dir, work);
    }
    return work;
  }

  /** The type a position belongs to through something declared apart (a receiver method or an impl block). */
  private async apartTypeAt(loc: Loc): Promise<{ node: Node; block?: Apart["blocks"][number] } | undefined> {
    const pack = rulesFor(loc.file);
    if (!pack.receiver && !pack.apart) {
      return undefined;
    }
    for (const [typeName, apart] of await this.declaredApart(loc.file)) {
      const block = apart.blocks.find((b) => b.file === loc.file && contains(b.sym.range, loc.range.start));
      if (block || apart.methods.some((m) => m.file === loc.file && contains(m.sym.range, loc.range.start))) {
        const node = await this.packageType(loc.file, typeName);
        return node ? { node, block } : undefined;
      }
    }
    return undefined;
  }

  /** A block's header: from its start to where its body opens; the positions of its supertype names. */
  private async blockSupertypes(block: Apart["blocks"][number]): Promise<{ pos: Pos; end: Pos }[]> {
    const text = await this.text(block.file);
    if (!text || !block.supertypes.length) {
      return [];
    }
    const lines = text.split("\n");
    const from = offsetOf(lines, block.sym.range.start);
    const opens = text.indexOf(rulesFor(block.file).header?.opens ?? "{", from);
    const header = text.slice(from, opens < 0 ? offsetOf(lines, block.sym.range.end) : opens);
    const out: { pos: Pos; end: Pos }[] = [];
    for (const name of block.supertypes) {
      const m = new RegExp(`\\b${name.replace(/[^\w]/g, "")}\\b`).exec(header);
      if (m) {
        out.push({ pos: positionOf(lines, from + m.index + name.length - 1), end: positionOf(lines, from + m.index + name.length) });
      }
    }
    return out;
  }

  private register(file: string, sym: Sym, kind: string, members: Pick<Node, "fields" | "methods">): Node {
    const key = `${file}#${sym.name}@${sym.selectionRange.start.line}`;
    const existing = this.byKey.get(key);
    if (existing) {
      return existing;
    }
    const base = sym.name.replace(/[^A-Za-z0-9_]/g, "_") || "symbol";
    let id = base;
    for (let n = 2; this.usedIds.has(id) || id.startsWith("more_"); n++) {
      id = `${base}_${n}`;
    }
    this.usedIds.add(id);
    const node: Node = { id, name: sym.name, kind, file, sym, ...members };
    this.byKey.set(key, node);
    this.nodes.set(id, node);
    return node;
  }

  /** The class whose name a declaration answer (up, down, out) lands on. */
  private async declaredAt(loc: Loc): Promise<Node | undefined> {
    if (!this.counts(loc.file)) {
      return undefined;
    }
    const named = (await this.nodesIn(loc.file)).find((n) => contains(n.sym.selectionRange, loc.range.start));
    // An answer landing on a block declared apart (Rust `impl Store for MemStore`) is that block's type.
    return named ?? (await this.apartTypeAt(loc))?.node;
  }

  /** The consumer of a reference: a declaration name, else the innermost symbol around it. */
  private async nodeAt(loc: Loc): Promise<Node | undefined> {
    if (!this.counts(loc.file)) {
      return undefined;
    }
    const nodes = await this.nodesIn(loc.file);
    const declared = nodes.find((n) => contains(n.sym.selectionRange, loc.range.start));
    if (declared) {
      return declared;
    }
    const around = nodes.filter((n) => contains(n.sym.range, loc.range.start)).sort((a, b) => size(a.sym.range) - size(b.sym.range))[0];
    if (around) {
      return around;
    }
    // Inside a method or block declared apart: its type (rule 1), declared anywhere in the folder.
    return (await this.apartTypeAt(loc))?.node;
  }

  private async packageType(file: string, name: string): Promise<Node | undefined> {
    const files = (await ask(() => this.providers.siblings(file), [file])).filter((f) => sameLanguage(f, file)).sort(compare);
    for (const f of files) {
      const node = (await this.nodesIn(f)).find((n) => n.name === name && n.kind !== "function");
      if (node) {
        return node;
      }
    }
    return undefined;
  }

  private link(from: Node, to: Node, direction: Direction, edge: { from: Node; to: Node; kind: EdgeKind; label?: string }) {
    if (from === to) {
      return;
    }
    const list = this.adjacency.get(from.id) ?? [];
    if (!list.some((n) => n.id === to.id && n.direction === direction)) {
      list.push({ direction, id: to.id });
      this.adjacency.set(from.id, list);
    }
    const key = `${edge.from.id}|${edge.to.id}`;
    const existing = this.edgeMap.get(key);
    const rank: Record<EdgeKind, number> = { inherits: 3, realizes: 3, association: 2, dependency: 1 };
    if (!existing || rank[edge.kind] > rank[existing.kind]) {
      this.edgeMap.set(key, { from: edge.from.id, to: edge.to.id, kind: edge.kind, labels: edge.label ? [edge.label] : [] });
    } else if (existing.kind === edge.kind && edge.label && !existing.labels.includes(edge.label)) {
      existing.labels.push(edge.label);
    }
  }

  private texts = new Map<string, Promise<string>>();

  private text(file: string): Promise<string> {
    let work = this.texts.get(file);
    if (!work) {
      work = ask(() => this.providers.text(file), "");
      this.texts.set(file, work);
    }
    return work;
  }

  /**
   * The declaration header of a class: from the end of its name to where its
   * body opens (`{`; Python `:`), as [start offset, text]. C#: a `where`
   * clause (generic constraints) ends it.
   */
  private async header(node: Node): Promise<{ text: string; lines: string[]; start: Pos } | undefined> {
    const rule = rulesFor(node.file).header;
    const text = rule ? await this.text(node.file) : "";
    if (!rule || !text) {
      return undefined;
    }
    const lines = text.split("\n");
    const start = node.sym.selectionRange.end;
    const from = offsetOf(lines, start);
    let end = from;
    let depth = 0;
    for (; end < text.length; end++) {
      const c = text[end];
      if ((c === rule.opens || c === ";") && depth === 0) {
        break; // a declaration without a body (`struct Money(i64);`) ends at `;`
      }
      if ("([<".includes(c)) {
        depth++;
      } else if (")]>".includes(c)) {
        depth--;
      }
    }
    let header = text.slice(from, end);
    if (rule.cut) {
      header = header.replace(rule.cut, "");
    }
    return { text: header, lines, start };
  }

  /**
   * The names in a header at nesting depth 0 (type arguments excluded;
   * Python: the names in its base list), as offset spans.
   */
  private async headerNames(node: Node): Promise<{ lines: string[]; spans: [number, number][] }> {
    const header = await this.header(node);
    if (!header) {
      return { lines: [], spans: [] };
    }
    const baseDepth = rulesFor(node.file).header?.baseDepth ?? 0;
    const base = offsetOf(header.lines, header.start);
    const spans: [number, number][] = [];
    let depth = 0;
    for (let i = 0; i < header.text.length; i++) {
      const c = header.text[i];
      if ("([<".includes(c)) {
        depth++;
      } else if (")]>".includes(c)) {
        depth--;
      } else if (/[A-Za-z_\\]/.test(c) && (i === 0 || !/[\w$\\]/.test(header.text[i - 1]))) {
        const match = /^[A-Za-z_\\][\w\\.]*/.exec(header.text.slice(i))!;
        if (depth === baseDepth) {
          spans.push([base + i, base + i + match[0].length]);
        }
        i += match[0].length - 1;
      }
    }
    return { lines: header.lines, spans };
  }

  /** Positions to ask "go to definition" at: the last character of each header name. */
  private async headerPositions(node: Node): Promise<Pos[]> {
    const { lines, spans } = await this.headerNames(node);
    return spans.map(([, end]) => positionOf(lines, end - 1));
  }

  /** Whether a reference is one of a class's header names (rule 5). */
  private async inHeader(node: Node, at: Pos): Promise<boolean> {
    const { lines, spans } = await this.headerNames(node);
    const offset = offsetOf(lines, at);
    return spans.some(([start, end]) => offset >= start && offset < end);
  }

  /** Positions of the names inside a range, except those in `skip` (the field's own name). */
  private async namesIn(file: string, range: Span, skip: Span): Promise<Pos[]> {
    const text = await this.text(file);
    if (!text) {
      return [];
    }
    const lines = text.split("\n");
    const from = offsetOf(lines, range.start);
    const slice = text.slice(from, offsetOf(lines, range.end));
    const positions: Pos[] = [];
    for (const m of slice.matchAll(/[A-Za-z_][\w]*/g)) {
      const pos = positionOf(lines, from + m.index! + m[0].length - 1);
      if (!contains(skip, pos) && (m.index === 0 || slice[m.index! - 1] !== "$")) {
        positions.push(pos);
      }
    }
    return positions;
  }

  private async load(id: string): Promise<void> {
    const node = this.nodes.get(id);
    if (!node) {
      return;
    }
    const at = node.sym.selectionRange.start;
    const hierarchyKind = (parent: Node, child: Node): EdgeKind =>
      parent.kind === "interface" && child.kind !== "interface" ? "realizes" : "inherits";

    let subtypesUnknown = false;
    if (node.kind !== "function") {
      // 2. up
      const supertypes = await ask(() => this.providers.supertypes(node.file, at), undefined);
      const parents: Node[] = [];
      for (const loc of supertypes ?? []) {
        const parent = await this.declaredAt(loc);
        if (parent) {
          parents.push(parent);
        }
      }
      if (supertypes === undefined && rulesFor(node.file).header) {
        for (const pos of await this.headerPositions(node)) {
          for (const loc of await ask(() => this.providers.definition(node.file, pos), [])) {
            const parent = await this.declaredAt(loc);
            if (parent && parent !== node && parent.kind !== "function") {
              parents.push(parent);
              this.fallbacks.add("up: from class declarations (no type hierarchy from the language extension)");
            }
          }
        }
      }
      if (supertypes === undefined && (rulesFor(node.file).apart)) {
        for (const block of (await this.declaredApart(node.file)).get(node.name)?.blocks ?? []) {
          for (const { pos } of await this.blockSupertypes(block)) {
            for (const loc of await ask(() => this.providers.definition(block.file, pos), [])) {
              const parent = await this.declaredAt(loc);
              if (parent && parent !== node && parent.kind !== "function") {
                parents.push(parent);
                this.fallbacks.add("up: from blocks declared apart (impl … for …; no type hierarchy from the language extension)");
              }
            }
          }
        }
      }
      for (const parent of parents) {
        this.link(node, parent, "up", { from: parent, to: node, kind: hierarchyKind(parent, node) });
      }
      // 3. down
      const subtypes = await ask(() => this.providers.subtypes(node.file, at), undefined);
      subtypesUnknown = subtypes === undefined;
      const below = subtypes ?? (await ask(() => this.providers.implementations(node.file, at), []));
      for (const loc of below) {
        const child = await this.declaredAt(loc);
        if (child && child !== node) {
          this.link(node, child, "down", { from: node, to: child, kind: hierarchyKind(node, child) });
        }
      }
      // 4. out (an enum's values hold the enum itself: not asked)
      for (const field of node.sym.kind === "Enum" ? [] : node.fields.filter((f) => f.kind !== "EnumMember")) {
        const typesAt = async (locs: Loc[]) => {
          const found: Node[] = [];
          for (const loc of locs) {
            const used = await this.declaredAt(loc);
            if (used && used !== node && used.kind !== "function" && !found.includes(used)) {
              found.push(used);
            }
          }
          return found;
        };
        let used = await typesAt(await ask(() => this.providers.typeDefinition(node.file, field.selectionRange.start), []));
        if (used.length === 0) {
          // The whole declaration: from the start of its first line to the end of its last (some extensions' ranges cover only the name).
          const declaration = { start: { line: field.range.start.line, character: 0 }, end: { line: field.range.end.line, character: Number.MAX_SAFE_INTEGER } };
          const targets: Loc[] = [];
          for (const pos of await this.namesIn(node.file, declaration, field.selectionRange)) {
            targets.push(...(await ask(() => this.providers.definition(node.file, pos), [])));
          }
          used = await typesAt(targets);
          if (used.length) {
            this.fallbacks.add("out: field types from definitions of the names in each field");
          }
        }
        for (const target of used) {
          this.link(node, target, "out", { from: node, to: target, kind: "association", label: rulesFor(node.file).memberName(field) });
        }
      }
    }

    // 5. in
    const references = (await ask(() => this.providers.references(node.file, at), [])).filter((loc) => this.counts(loc.file));
    const files = [...new Set(references.map((r) => r.file))].sort(compare);
    const resolved = new Set(files.slice(0, MAX_REFERENCE_FILES));
    if (files.length > MAX_REFERENCE_FILES) {
      this.unresolved.set(id, files.length - MAX_REFERENCE_FILES);
    }
    for (const loc of references.filter((r) => resolved.has(r.file)).sort((a, b) => compare(a.file, b.file) || a.range.start.line - b.range.start.line)) {
      if (loc.file === node.file && contains(node.sym.range, loc.range.start)) {
        continue; // its own declaration and members
      }
      const apart = await this.apartTypeAt(loc);
      if (apart?.block && apart.node !== node) {
        const names = await this.blockSupertypes(apart.block);
        if (names.some((n) => n.pos.line === loc.range.start.line && loc.range.start.character <= n.pos.character && n.end.character <= loc.range.end.character + 1)) {
          // `impl Node for Consumer`: a subtype, not a use.
          this.link(node, apart.node, "down", { from: node, to: apart.node, kind: hierarchyKind(node, apart.node) });
          continue;
        }
      }
      const consumer = await this.nodeAt(loc);
      if (consumer && consumer !== node) {
        if (consumer.kind !== "function" && rulesFor(loc.file).header && (await this.inHeader(consumer, loc.range.start))) {
          // `class Consumer extends Node`: a subtype, not a use.
          this.link(node, consumer, "down", { from: node, to: consumer, kind: hierarchyKind(node, consumer) });
          if (subtypesUnknown) {
            this.fallbacks.add("down: from class declarations that name it (no type hierarchy from the language extension)");
          }
        } else {
          this.link(node, consumer, "in", { from: consumer, to: node, kind: "dependency" });
        }
      }
    }
  }
}

function offsetOf(lines: string[], at: Pos): number {
  let offset = 0;
  for (let i = 0; i < at.line && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset + Math.min(at.character, lines[at.line]?.length ?? 0);
}

function positionOf(lines: string[], offset: number): Pos {
  let line = 0;
  while (line < lines.length - 1 && offset > lines[line].length) {
    offset -= lines[line].length + 1;
    line++;
  }
  return { line, character: offset };
}

function kindOf(sym: Sym, pack: LanguagePack): string {
  switch (sym.kind) {
    case "Interface":
      return "interface";
    case "Enum":
      return "enum";
    case "Struct":
      return "struct";
    default:
      return pack.classKind ?? "struct";
  }
}
