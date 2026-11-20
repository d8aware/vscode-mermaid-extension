/**
 * The two plug-in points for language support. Everything language- or
 * ecosystem-specific lives in a pack; the engines (src/landscape/scan.ts,
 * src/classDiagram/ProviderGraph.ts) only ask packs. Packs are fixed rules
 * applied to files and to language-extension answers, so results stay
 * deterministic. See docs/language-packs.md.
 */
import type { Sym } from "../classDiagram/ProviderGraph";

// ---------------------------------------------------------------------------
// Ecosystem packs: "Explore From Here" on a folder (the landscape)

/** A file whose presence makes its folder a project. */
export interface MarkerRule {
  /** Shown as the project's kind when this is its first marker. */
  kind: string;
  /** How the rule is written in docs and tooltips. */
  pattern: string;
  matches: (fileName: string) => boolean;
  /**
   * Label priority across all packs: when a folder has several markers, the
   * lowest number names its kind.
   */
  priority: number;
}

/** What a project folder declares about itself, read from its files. */
export interface ProjectFacts {
  /** Names other projects can depend on or import, per namespace (e.g. "npm", "go"). */
  names?: { namespace: string; name: string; source: string }[];
  /** Names of other projects it declares a dependency on. */
  dependencies?: { namespace: string; name: string; rule: string }[];
  /** Other projects it references by path (absolute). */
  paths?: { path: string; rule: string }[];
  /** Import aliases (e.g. tsconfig `paths`): alias -> absolute target folder. */
  aliases?: Map<string, string>;
  /** Folders the project declares its source code in (absolute), e.g. angular.json `sourceRoot`. */
  sourceRoots?: { dir: string; rule: string }[];
  /** Files the project declares as program or library entry points (absolute), e.g. a build target's `main`. */
  entries?: { file: string; rule: string }[];
}

/** What the engine offers a CodeRule while resolving one project's imports. */
export interface CodeContext {
  /** The project folder. */
  dir: string;
  /** The project's facts from every pack. */
  facts: ProjectFacts[];
  /** An import alias (tsconfig `paths`) of this project or a parent: the target path, with the rest of the specifier appended. */
  alias(spec: string): string | undefined;
  /** Whether a path exists as a file. */
  isFile(p: string): boolean;
  /** Whether a path exists as a folder. */
  isDir(p: string): boolean;
}

/**
 * How a language's source files refer to each other inside one project (the
 * project view). Imports resolve either by path (`resolve`) or by declared
 * namespace (`declares`): an import names a namespace some files declare.
 */
export interface CodeRule {
  /** Which files the rule reads. */
  files: (filePath: string) => boolean;
  /** The imports in a file, as written (comments and strings must not count). */
  read: (text: string) => string[];
  /** Path imports: the file or folder a specifier points to, or undefined. */
  resolve?: (spec: string, fromFile: string, context: CodeContext) => string | undefined;
  /** Namespace imports: the namespaces a file declares (`namespace A.B`, `package a.b`). */
  declares?: (text: string) => string[];
  /** Separator of namespace segments ("." or "\\"). */
  separator?: string;
  /** Whether the language itself marks the file as a program entry; returns the rule's name. */
  entry?: (text: string, filePath: string) => string | undefined;
  /** The rule named on arrows. */
  rule: string;
}

/** How a pack's source files reference other projects. */
export interface ImportRule {
  /** Which files are read. */
  files: (filePath: string) => boolean;
  /** The import specifiers in a file (comments and strings must not count). */
  read: (text: string) => string[];
  /** Specifiers are matched against names in this namespace (exact, else longest `/` prefix). */
  namespace: string;
  /** The rule named on arrows from name matches. */
  rule: string;
  /** When set, specifiers are first resolved as aliases (ProjectFacts.aliases) through the importing project and its parents. */
  aliasRule?: string;
}

export interface EcosystemPack {
  id: string;
  /** Shown in docs. */
  label: string;
  markers: MarkerRule[];
  /** Reads a project folder's declared facts. Called only for folders that are projects. */
  readProject?: (dir: string, fileNames: string[]) => ProjectFacts;
  /** Imports between projects (the landscape). */
  imports?: ImportRule;
  /** Imports between files inside a project (the project view). */
  code?: CodeRule[];
}

// ---------------------------------------------------------------------------
// Language packs: "Explore Classes From Here" on a file

export interface LanguagePack {
  id: string;
  label: string;
  /** File extensions, lower case, with the dot. */
  extensions: string[];
  /**
   * Where the explorer's answers come from: our own analysis (TypeScript,
   * ts-morph) or the installed language extension (ProviderGraph).
   */
  source: "analysis" | "language-extension";
  /** Marketplace id suggested when no extension answers (e.g. "golang.go"). */
  suggestedExtension?: string;
  /** Test files: left out unless classDiagram.includeTestFiles is on. */
  testFile?: RegExp;
  /**
   * Methods declared apart from their type (Go): a top-level method symbol's
   * receiver type and method name. Such methods are looked up across the
   * file's folder (the package).
   */
  receiver?: (symbolName: string) => { type: string; method: string } | undefined;
  /**
   * Blocks that declare a type's methods (and supertypes) apart from the type:
   * Rust `impl Trait for Type`, Swift `extension Type: Protocol`. Given the
   * name of a symbol that is not a type, the type it adds to and the
   * supertype names its header declares. Its method children belong to that
   * type; like receivers, looked up across the file's folder.
   */
  apart?: (symbolName: string) => { type: string; supertypes: string[] } | undefined;
  /**
   * The declaration-header rule (supertypes and subtypes from `class A
   * extends B {`), used when the extension has no type hierarchy. Undefined:
   * the language declares no inheritance in headers (Go).
   */
  header?: {
    /** Where the body opens: the header ends at the first of these at depth 0. */
    opens: string;
    /** Nesting depth of the base names: 0 (`extends B`), 1 (Python `class A(B):`). */
    baseDepth: number;
    /** Text from a match on is not part of the base list (C# `where` constraints). */
    cut?: RegExp;
  };
  /** Kind for a symbol reported as Class that is not a class (Go named types). */
  classKind?: string;
  /** One member line of a lit box (Mermaid class member syntax). */
  member: (sym: Sym, method: boolean, params?: string[], name?: string) => string;
  /** A member's plain name (arrow labels). */
  memberName: (sym: Sym) => string;
}
