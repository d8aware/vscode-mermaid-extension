/**
 * Generates a Mermaid class diagram from the TypeScript sources in a folder.
 *
 * Deliberately free of any `vscode` dependency so it can be unit-tested and run
 * outside the editor. The VS Code command (GenerateClassDiagramCommand) handles
 * the UI: progress, cancellation, writing the file and opening the preview.
 */
import * as fs from "fs";
import * as path from "path";
import {
  ClassDeclaration,
  EnumDeclaration,
  InterfaceDeclaration,
  MethodDeclaration,
  MethodSignature,
  Node,
  ParameterDeclaration,
  Project,
  Scope,
  SourceFile,
  Symbol as MorphSymbol,
  ts,
  Type,
  TypeAliasDeclaration,
  TypeNode,
} from "ts-morph";

/**
 * How much of each class to show:
 * - `full`: every member
 * - `public`: public members only (private `-` and protected `#` are dropped)
 * - `names`: no members; just the box (and its <<interface>>-style label)
 */
export type DetailLevel = "full" | "public" | "names";

export interface GenerateOptions {
  /** Called once per source file as it is processed. */
  onProgress?: (done: number, total: number, fileName: string) => void;
  /** Polled between files; return true to stop with GenerationCancelledError. */
  isCancelled?: () => boolean;
  /**
   * Members to show (default `full`). In a focused diagram this applies to the
   * neighbouring classes; the focused classes are always shown in full.
   */
  detail?: DetailLevel;
  /**
   * Group classes into Mermaid namespaces by their folder, relative to this
   * folder. Classes directly in it stay ungrouped. Ignored when every class
   * is in the same folder.
   */
  groupByFolderFrom?: string;
  /**
   * Focused diagram: the declarations in these files, plus every declaration
   * with an arrow to or from them, and only the arrows touching them.
   */
  focusFiles?: string[];
}

export interface FolderOptions {
  /** Include *.spec.* / *.test.* files and __tests__ folders (default false). */
  includeTestFiles?: boolean;
  /** Files to include even if they would be skipped (e.g. a focused test file). */
  alwaysInclude?: string[];
}

export class GenerationCancelledError extends Error {
  constructor() {
    super("Class diagram generation was cancelled");
  }
}

const SOURCE_GLOBS = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TEST_FILE = /[.-](spec|test)\.[cm]?tsx?$|[\\/]__tests__[\\/]/;

/**
 * Used when the folder has no tsconfig.json above it (or it cannot be read),
 * so the output doesn't depend on whatever defaults the bundled TypeScript
 * version happens to have.
 */
const FALLBACK_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  jsx: ts.JsxEmit.Preserve,
  experimentalDecorators: true,
};

/**
 * Nearest tsconfig.json in `folder` or any parent folder. If there is none,
 * the nearest tsconfig.base.json: monorepo roots (e.g. Nx) often only have
 * that file, and it holds the path aliases that imports between packages use.
 */
export function findTsConfig(folder: string): string | undefined {
  for (const fileName of ["tsconfig.json", "tsconfig.base.json"]) {
    let dir = path.resolve(folder);
    for (;;) {
      const candidate = path.join(dir, fileName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }
  }
  return undefined;
}

/**
 * Creates a ts-morph project for `folder`, using the project's own tsconfig.json
 * (compiler options, path aliases) when there is one, and returns the source
 * files inside the folder that should appear in the diagram.
 */
export function loadFolder(folder: string, options: FolderOptions = {}) {
  const root = path.resolve(folder);
  let tsConfigFilePath = findTsConfig(root);
  let project: Project;
  try {
    project = tsConfigFilePath
      ? new Project({ tsConfigFilePath, skipAddingFilesFromTsConfig: true })
      : new Project({ compilerOptions: FALLBACK_COMPILER_OPTIONS });
  } catch {
    // An unreadable tsconfig shouldn't stop us; fall back to fixed options.
    tsConfigFilePath = undefined;
    project = new Project({ compilerOptions: FALLBACK_COMPILER_OPTIONS });
  }

  const globRoot = root.replace(/\\/g, "/");
  project.addSourceFilesAtPaths([
    ...SOURCE_GLOBS.map((glob) => `${globRoot}/${glob}`),
    `!${globRoot}/**/node_modules/**`,
  ]);

  const alwaysInclude = new Set((options.alwaysInclude ?? []).map((f) => path.resolve(f)));
  for (const file of alwaysInclude) {
    project.addSourceFileAtPathIfExists(file);
  }

  const inFolder = root + path.sep;
  const sourceFiles = project
    .getSourceFiles()
    .filter((sourceFile) => {
      const filePath = path.resolve(sourceFile.getFilePath());
      return (
        alwaysInclude.has(filePath) ||
        (filePath.startsWith(inFolder) &&
          !DECLARATION_FILE.test(filePath) &&
          (options.includeTestFiles || !TEST_FILE.test(filePath)))
      );
    })
    .sort((a, b) => compare(a.getFilePath(), b.getFilePath()));

  return { project, sourceFiles, tsConfigFilePath };
}

type DiagramDeclaration =
  | ClassDeclaration
  | InterfaceDeclaration
  | EnumDeclaration
  | TypeAliasDeclaration;

/** A class, interface, enum or object type alias in the diagram. */
export interface Entry {
  node: DiagramDeclaration;
  name: string;
  /** Mermaid id, unique in the model. */
  id: string;
  /** Display label, when it differs from the id (duplicates, generics). */
  label?: string;
}

export type EdgeKind = "inherits" | "realizes" | "association" | "dependency";

export const EDGE_ARROWS: Record<EdgeKind, string> = {
  inherits: "<|--",
  realizes: "<|..",
  association: "-->",
  dependency: "..>",
};

/** Counts what a diagram of these files would contain, without resolving types. */
export function summarize(sourceFiles: SourceFile[], root: string) {
  const declarations = sourceFiles.flatMap(collectDeclarations);
  return {
    declarations: declarations.length,
    folders: new Set(declarations.map((d) => folderOf(d, root))).size,
  };
}

/**
 * An arrow as Mermaid draws it. For inherits/realizes `from` is the parent:
 * `from <|-- to` means `to` extends `from`. For association/dependency
 * `from` uses `to`.
 */
export interface Edge {
  from: string;
  to: string;
  kind: EdgeKind;
  labels: string[];
}

/** Everything resolved about a set of source files; views are rendered from it. */
export interface ClassModel {
  entries: Entry[];
  /** Deduplicated: no dependency arrow where an association to the same class exists. */
  edges: Edge[];
  /** Supertypes from outside the analysed files: name -> id. */
  externalIds: Map<string, string>;
}

/** Generates the Mermaid `classDiagram` text for the given source files. */
export async function generateClassDiagram(
  sourceFiles: SourceFile[],
  options: GenerateOptions = {}
): Promise<string> {
  const { entries, edges, externalIds } = await analyze(sourceFiles, options);

  // Decide what is in the diagram.
  let shownEdges = edges;
  let shownEntries = entries;
  const focusIds = new Set<string>();
  if (options.focusFiles) {
    const focusFiles = new Set(options.focusFiles.map((f) => path.resolve(f)));
    entries
      .filter((e) => focusFiles.has(path.resolve(e.node.getSourceFile().getFilePath())))
      .forEach((e) => focusIds.add(e.id));
    shownEdges = shownEdges.filter((e) => focusIds.has(e.from) || focusIds.has(e.to));
    const connected = new Set([...focusIds, ...shownEdges.flatMap((e) => [e.from, e.to])]);
    shownEntries = entries.filter((e) => connected.has(e.id));
  }

  // Render.
  const render = (entry: Entry) =>
    renderBlock(entry, focusIds.has(entry.id) ? "full" : options.detail ?? "full");
  const lines = ["classDiagram"];
  const groups = groupByFolder(shownEntries, options.groupByFolderFrom);
  for (const [namespace, members] of groups) {
    if (namespace === undefined) {
      lines.push(...members.map(render));
    } else {
      lines.push(`  namespace ${namespace} {`, ...members.map((m) => indent(render(m))), "  }");
    }
  }

  const shownIds = new Set(shownEdges.flatMap((e) => [e.from, e.to]));
  for (const [name, id] of [...externalIds].sort((a, b) => compare(a[1], b[1]))) {
    if (shownIds.has(id)) {
      lines.push(`  class ${id}${id !== name ? `["${escapeText(name)}"]` : ""}`);
    }
  }

  const focusStyles = [...focusIds].sort(compare).map((id) => `  ${FOCUS_STYLE(id)}`);
  return [...lines, ...shownEdges.map(edgeLine).sort(), ...focusStyles, ""].join("\n");
}

/**
 * Outline for focused classes. (Mermaid 12's class diagram parser only
 * accepts `stroke-width` after another property, hence `stroke` first.)
 */
export const FOCUS_STYLE = (id: string) => `style ${id} stroke:#e11d48,stroke-width:3px`;

/** One Mermaid relationship line (indented). */
export function edgeLine(e: Edge): string {
  // Dependencies are drawn without labels: a constructor taking `logger`
  // is clearer as a plain dashed arrow than with every parameter name.
  const label = e.kind === "association" && e.labels.length ? ` : ${formatLabels(e.labels)}` : "";
  return `  ${e.from} ${EDGE_ARROWS[e.kind]} ${e.to}${label}`;
}

/**
 * Resolves every declaration and arrow in the source files. Reports progress
 * per file and yields between files, so callers stay responsive.
 */
export async function analyze(
  sourceFiles: SourceFile[],
  options: Pick<GenerateOptions, "onProgress" | "isCancelled"> = {}
): Promise<ClassModel> {
  const entries = assignIds(sourceFiles.flatMap(collectDeclarations));
  const byNode = new Map<ts.Node, Entry>(entries.map((e) => [e.node.compilerNode, e]));
  const externalIds = new Map<string, string>(); // external type name -> id
  const edges = new Map<string, Edge>();

  const idFor = (declarations: Node[], fallbackName?: string): string | undefined => {
    for (const declaration of declarations) {
      const entry = byNode.get(declaration.compilerNode);
      if (entry) {
        return entry.id;
      }
    }
    if (fallbackName === undefined) {
      return undefined;
    }
    // A supertype from outside the folder (e.g. a library base class).
    const id = externalIds.get(fallbackName) ?? uniqueId(sanitizeId(fallbackName), entries, externalIds);
    externalIds.set(fallbackName, id);
    return id;
  };

  const addEdge = (from: string, to: string | undefined, kind: EdgeKind, label?: string) => {
    if (!to) {
      return;
    }
    // Mermaid's inheritance arrow points at the parent: `Parent <|-- Child`.
    const [left, right] = kind === "inherits" || kind === "realizes" ? [to, from] : [from, to];
    const key = `${left}|${right}|${kind}`;
    const edge = edges.get(key) ?? { from: left, to: right, kind, labels: [] };
    if (label && !edge.labels.includes(label)) {
      edge.labels.push(label);
    }
    edges.set(key, edge);
  };

  const supertype = (expression: Node, from: string, kind: EdgeKind) => {
    const name = expression.getText().replace(/<[\s\S]*$/, "");
    addEdge(from, idFor(declarationsOf(expression), name), kind);
  };

  const referenceEdges = (from: string, type: Type, kind: EdgeKind, label: string) => {
    for (const declaration of referencedDeclarations(type)) {
      addEdge(from, idFor([declaration]), kind, label);
    }
  };

  const fileEntries = new Map<SourceFile, Entry[]>();
  for (const entry of entries) {
    const sourceFile = entry.node.getSourceFile();
    fileEntries.set(sourceFile, [...(fileEntries.get(sourceFile) ?? []), entry]);
  }

  for (let i = 0; i < sourceFiles.length; i++) {
    if (options.isCancelled?.()) {
      throw new GenerationCancelledError();
    }
    const sourceFile = sourceFiles[i];
    for (const { node, id } of fileEntries.get(sourceFile) ?? []) {
      if (Node.isClassDeclaration(node)) {
        const base = node.getExtends();
        if (base) {
          supertype(base.getExpression(), id, "inherits");
        }
        node.getImplements().forEach((impl) => supertype(impl.getExpression(), id, "realizes"));
        node.getProperties().forEach((p) => referenceEdges(id, p.getType(), "association", p.getName()));
        node.getGetAccessors().forEach((a) => referenceEdges(id, a.getReturnType(), "association", a.getName()));
        node.getConstructors().forEach((ctor) =>
          ctor.getParameters().forEach((p) =>
            referenceEdges(id, p.getType(), p.isParameterProperty() ? "association" : "dependency", p.getName())
          )
        );
      } else if (Node.isInterfaceDeclaration(node)) {
        node.getExtends().forEach((ext) => supertype(ext.getExpression(), id, "inherits"));
        node.getProperties().forEach((p) => referenceEdges(id, p.getType(), "association", p.getName()));
      } else if (Node.isTypeAliasDeclaration(node)) {
        const literal = node.getTypeNode();
        if (Node.isTypeLiteral(literal)) {
          literal.getProperties().forEach((p) => referenceEdges(id, p.getType(), "association", p.getName()));
        }
      }
    }

    options.onProgress?.(i + 1, sourceFiles.length, sourceFile.getBaseName());
    // Let the editor update progress / process a cancel click between files.
    await new Promise((resolve) => setImmediate(resolve));
  }

  const associated = new Set(
    [...edges.values()].filter((e) => e.kind === "association").map((e) => `${e.from}|${e.to}`)
  );
  // A constructor parameter that is also stored in a field is already shown
  // by the association; the dependency arrow would only duplicate it.
  const deduplicated = [...edges.values()].filter(
    (e) => e.kind !== "dependency" || !associated.has(`${e.from}|${e.to}`)
  );
  return { entries, edges: deduplicated, externalIds };
}

/** Folder of a declaration relative to `root`, "" for files directly in it. */
export function folderOf(node: Node, root: string): string {
  const relative = path.relative(path.resolve(root), path.dirname(node.getSourceFile().getFilePath()));
  return relative.startsWith("..") ? "" : relative.split(path.sep).join("/");
}

/**
 * [namespace, entries] in output order; namespace undefined = ungrouped.
 * Mermaid namespaces can't nest and can't contain "/", so a folder such as
 * `libs/platform` becomes the namespace `libs.platform`.
 */
function groupByFolder(entries: Entry[], root: string | undefined): [string | undefined, Entry[]][] {
  const byFolder = new Map<string, Entry[]>();
  for (const entry of entries) {
    const folder = root === undefined ? "" : folderOf(entry.node, root);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), entry]);
  }
  if (root === undefined || byFolder.size <= 1) {
    return [[undefined, entries]];
  }
  const used = new Set<string>();
  return [...byFolder.keys()].sort(compare).map((folder) => {
    if (folder === "") {
      return [undefined, byFolder.get(folder)!];
    }
    const base = sanitizeId(folder
        .split("/")
        .map((part) => part.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(?=[0-9])/, "_"))
        .join("."), ".");
    let name = base;
    for (let n = 2; used.has(name); n++) {
      name = `${base}_${n}`;
    }
    used.add(name);
    return [name, byFolder.get(folder)!];
  });
}

function indent(block: string): string {
  return block
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Declarations and ids

function collectDeclarations(container: SourceFile | Node): DiagramDeclaration[] {
  if (!Node.isSourceFile(container) && !Node.isModuleDeclaration(container)) {
    return [];
  }
  const declarations: DiagramDeclaration[] = [];
  for (const statement of container.getStatements()) {
    if (Node.isClassDeclaration(statement) && statement.getName()) {
      declarations.push(statement);
    } else if (Node.isInterfaceDeclaration(statement) || Node.isEnumDeclaration(statement)) {
      declarations.push(statement);
    } else if (Node.isTypeAliasDeclaration(statement) && Node.isTypeLiteral(statement.getTypeNode())) {
      declarations.push(statement);
    } else if (Node.isModuleDeclaration(statement)) {
      declarations.push(...collectDeclarations(statement));
    }
  }
  return declarations;
}

function assignIds(declarations: DiagramDeclaration[]): Entry[] {
  const used = new Map<string, number>();
  return declarations.map((node) => {
    const name = node.getName() ?? "Anonymous";
    const base = sanitizeId(name);
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const id = count === 1 ? base : `${base}_${count}`;
    const typeParameters =
      Node.isClassDeclaration(node) || Node.isInterfaceDeclaration(node) || Node.isTypeAliasDeclaration(node)
        ? node.getTypeParameters().map((tp) => tp.getName())
        : [];
    const display = typeParameters.length ? `${name}<${typeParameters.join(", ")}>` : name;
    return { node, name, id, label: display !== id ? display : undefined };
  });
}

function uniqueId(base: string, entries: Entry[], external: Map<string, string>): string {
  const taken = new Set([...entries.map((e) => e.id), ...external.values()]);
  let id = base;
  for (let n = 2; taken.has(id); n++) {
    id = `${base}_${n}`;
  }
  return id;
}

/** Locale-independent ordering, so output is identical on every machine. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sanitizeId(name: string, alsoAllowed = ""): string {
  const id = name.replace(alsoAllowed ? /[^A-Za-z0-9_.]/g : /[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(id) ? id : `_${id}`;
}

// ---------------------------------------------------------------------------
// Rendering

export function renderBlock(entry: Entry, detail: DetailLevel): string {
  const [header, ...body] = renderFullBlock(entry).split("\n");
  const closing = body.pop()!;
  const keep = (line: string) => {
    const member = line.trim();
    if (member.startsWith("<<")) {
      return true; // <<interface>>, <<abstract>>, ...
    }
    if (detail === "names") {
      return false;
    }
    return detail === "full" || !(member.startsWith("-") || member.startsWith("#"));
  };
  return [header, ...body.filter(keep), closing].join("\n");
}

function renderFullBlock({ node, id, label }: Entry): string {
  const header = `  class ${id}${label ? `["${escapeText(label)}"]` : ""} {`;
  const lines = [header];

  if (Node.isClassDeclaration(node)) {
    if (node.isAbstract()) {
      lines.push("    <<abstract>>");
    }
    const seen = new Set<string>();
    const field = (text: string, name: string) => {
      if (!seen.has(name)) {
        seen.add(name);
        lines.push(`    ${text}`);
      }
    };
    node.getConstructors().forEach((ctor) =>
      ctor.getParameters().filter((p) => p.isParameterProperty()).forEach((p) =>
        field(`${visibility(p)}${p.getName()}: ${typeOf(p.getTypeNode(), () => p.getType(), p)}`, p.getName())
      )
    );
    node.getProperties().forEach((p) =>
      field(
        `${visibility(p)}${p.getName()}${optional(p)}: ${typeOf(p.getTypeNode(), () => p.getType(), p)}${p.isStatic() ? "$" : ""}`,
        p.getName()
      )
    );
    node.getGetAccessors().forEach((a) =>
      field(
        `${visibility(a)}${a.getName()}: ${typeOf(a.getReturnTypeNode(), () => a.getReturnType(), a)}${a.isStatic() ? "$" : ""}`,
        a.getName()
      )
    );
    node.getSetAccessors().forEach((a) => {
      const parameter = a.getParameters()[0];
      const type = parameter ? typeOf(parameter.getTypeNode(), () => parameter.getType(), a) : "unknown";
      field(`${visibility(a)}${a.getName()}: ${type}${a.isStatic() ? "$" : ""}`, a.getName());
    });
    node.getMethods().forEach((m) => lines.push(`    ${method(m)}`));
  } else if (Node.isInterfaceDeclaration(node)) {
    lines.push("    <<interface>>");
    node.getProperties().forEach((p) =>
      lines.push(`    +${p.getName()}${optional(p)}: ${typeOf(p.getTypeNode(), () => p.getType(), p)}`)
    );
    node.getMethods().forEach((m) => lines.push(`    ${method(m)}`));
  } else if (Node.isEnumDeclaration(node)) {
    lines.push("    <<enumeration>>");
    node.getMembers().forEach((m) => lines.push(`    ${m.getName()}`));
  } else {
    lines.push("    <<type>>");
    const literal = node.getTypeNode();
    if (Node.isTypeLiteral(literal)) {
      literal.getProperties().forEach((p) =>
        lines.push(`    +${p.getName()}${optional(p)}: ${typeOf(p.getTypeNode(), () => p.getType(), p)}`)
      );
      literal.getMethods().forEach((m) => lines.push(`    ${method(m)}`));
    }
  }

  lines.push("  }");
  return lines.join("\n");
}

function method(m: MethodDeclaration | MethodSignature): string {
  const returnType = typeOf(m.getReturnTypeNode(), () => m.getReturnType(), m);
  const classifier = Node.isMethodDeclaration(m) ? (m.isStatic() ? "$" : m.isAbstract() ? "*" : "") : "";
  const scope = Node.isMethodDeclaration(m) ? visibility(m) : "+";
  // Mermaid syntax is `name(params) ReturnType` (no colon); it adds the ` : `.
  return `${scope}${m.getName()}(${parameterNames(m.getParameters())}) ${returnType}${classifier}`;
}

function optional(node: Node): string {
  return Node.isQuestionTokenable(node) && node.hasQuestionToken() ? "?" : "";
}

function visibility(node: Node): string {
  if (Node.isPrivateIdentifier((node as any).getNameNode?.())) {
    return "-"; // #private
  }
  const scope = Node.isScoped(node) || Node.isScopeable(node) ? node.getScope() ?? Scope.Public : Scope.Public;
  return scope === Scope.Private ? "-" : scope === Scope.Protected ? "#" : "+";
}

function parameterNames(parameters: ParameterDeclaration[]): string {
  const names = (name: Node): string[] =>
    Node.isObjectBindingPattern(name) || Node.isArrayBindingPattern(name)
      ? name.getElements().flatMap((element) => (Node.isBindingElement(element) ? names(element.getNameNode()) : []))
      : [name.getText()];
  return parameters
    .filter((p) => p.getName() !== "this")
    .flatMap((p) => names(p.getNameNode()).map((n) => (p.isRestParameter() ? `...${n}` : n)))
    .join(", ");
}

const MAX_TYPE_LENGTH = 60;

/** The type as written in the source when present, otherwise the inferred type. */
function typeOf(typeNode: TypeNode | undefined, inferred: () => Type, enclosing: Node): string {
  const text = typeNode
    ? typeNode.getText()
    : inferred().getText(enclosing, ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
  return formatType(text);
}

export function formatType(text: string): string {
  let type = text.replace(/import\("[^"]*"\)\./g, "").replace(/\s+/g, " ").trim();
  if (type.includes("=>")) {
    type = "Function"; // parentheses would make Mermaid read the member as a method
  } else if (/[{};]/.test(type)) {
    type = "object"; // inline object types would break the class block
  }
  type = type.replace(/[()]/g, "").replace(/"/g, "'");
  if (type.length > MAX_TYPE_LENGTH) {
    const generic = type.indexOf("<");
    type = generic > 0 && generic < MAX_TYPE_LENGTH ? `${type.slice(0, generic)}<…>` : `${type.slice(0, MAX_TYPE_LENGTH - 1)}…`;
  }
  return escapeText(type);
}

/** Mermaid strips raw `<`/`>` and can't nest `~T~` generics; entities render. */
export function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatLabels(labels: string[]): string {
  const shown = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${shown}, …` : shown;
}

// ---------------------------------------------------------------------------
// Type resolution

function resolveSymbol(symbol: MorphSymbol): MorphSymbol {
  return symbol.isAlias() ? symbol.getAliasedSymbol() ?? symbol : symbol;
}

function declarationsOf(expression: Node): Node[] {
  const symbol = expression.getSymbol();
  return symbol ? resolveSymbol(symbol).getDeclarations() : [];
}

/**
 * Declarations referenced by a type: the type itself, array elements, generic
 * arguments (`Promise<User>`, `Map<string, Order[]>`) and union/intersection
 * members. Matching is by declaration, not by name, so it works across files,
 * imports and path aliases, and same-named classes stay distinct.
 */
function referencedDeclarations(type: Type): Node[] {
  const found: Node[] = [];
  const seen = new Set<ts.Type>();
  const visit = (t: Type, depth: number) => {
    if (depth > 5 || seen.has(t.compilerType)) {
      return;
    }
    seen.add(t.compilerType);
    for (const symbol of [t.getAliasSymbol(), t.getSymbol()]) {
      if (symbol) {
        found.push(...resolveSymbol(symbol).getDeclarations());
      }
    }
    const elementType = t.getArrayElementType();
    if (elementType) {
      visit(elementType, depth + 1);
    }
    [...t.getTypeArguments(), ...t.getAliasTypeArguments()].forEach((arg) => visit(arg, depth + 1));
    if (t.isUnion()) {
      t.getUnionTypes().forEach((u) => visit(u, depth + 1));
    }
    if (t.isIntersection()) {
      t.getIntersectionTypes().forEach((u) => visit(u, depth + 1));
    }
  };
  visit(type, 0);
  return found;
}
