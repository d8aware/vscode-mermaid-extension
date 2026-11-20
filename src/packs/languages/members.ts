/**
 * Member formatting shared by the language packs: how a language extension's
 * symbol becomes a Mermaid class member line, deterministically.
 */
import { escapeText } from "../../classDiagram/ClassDiagramGenerator";
import type { Sym } from "../../classDiagram/ProviderGraph";

/** `Add(Line) : void` -> { name: "Add", params: "(Line)", type: "void" }; `Sku : string` -> { name, type }. */
export function memberParts(raw: string): { name: string; params?: string; type?: string } {
  const m = /^([^(:\s]+)\s*(\(.*\))?\s*(?::\s*(.+))?$/.exec(raw.trim());
  return m ? { name: m[1], params: m[2], type: m[3]?.trim() } : { name: raw };
}

export const VISIBILITY: [RegExp, string][] = [
  [/\bprivate\b/, "-"],
  [/\bprotected\b/, "#"],
  [/\binternal\b/, "~"],
  [/\bpublic\b/, "+"],
];

/**
 * The generic member rules, for any language:
 * - a name `Name(params) : Type` or `Name : Type` (C#) is split into parts;
 * - a detail that is only a visibility keyword gives the marker (`-` `#` `~` `+`);
 * - a method without parameters in its name takes `params` (its child symbols
 *   before the body, PHP), else the names in its detail's first `(…)`.
 */
export function genericMember(sym: Sym, method: boolean, params?: string[]): string {
  const parts = memberParts(sym.name);
  const detail = (sym.detail ?? "").trim();
  const visibility = VISIBILITY.find(([pattern]) => pattern.test(detail))?.[1] ?? "";
  // A detail that repeats the name, or is only modifiers, says nothing more.
  const extra = detail === sym.name || /^((public|private|protected|internal|static|readonly|abstract|final|const)\s*)*$/.test(detail) ? "" : detail;
  if (method) {
    // signature() escapes; unescape so the whole line is escaped once.
    const shownParams = parts.params ?? (params ? `(${params.join(", ")})` : signature(extra, false).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
    const type = parts.type ? ` ${flattenNested(parts.type)}` : "";
    return `${visibility}${escapeText(parts.name)}(${escapeText(flattenNested(shownParams.slice(1, -1)))})${escapeText(type)}`;
  }
  const type = parts.type ?? (extra && extra !== parts.name ? extra : undefined);
  return `${visibility}${escapeText(parts.name)}${type ? `: ${escapeText(flattenNested(type))}` : ""}`;
}

export const genericMemberName = (sym: Sym) => memberParts(sym.name).name;

/**
 * Collapses `( … )` and `{ … }` groups to `…`: Mermaid reads a member line
 * with `(` as a method and `}` as the end of the class. `func(int) error` ->
 * `func… error`; `[ ]` (maps, generics) are kept.
 */
export function flattenNested(text: string): string {
  let depth = 0;
  let out = "";
  for (const c of text) {
    if (c === "(" || c === "{") {
      if (depth === 0) {
        out += "…";
      }
      depth++;
    } else if (c === ")" || c === "}") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      out += c;
    }
  }
  return out;
}

/**
 * `func(order *Order, id string) (Money, error)` -> `(order, id) Money, error`.
 * Parameter names only (as in the TypeScript diagrams); a result tuple loses
 * its parentheses, which Mermaid would misread.
 */
export function signature(detail: string | undefined, go = true): string {
  if (!go) {
    // Detail formats differ per extension: take the names from the first `(…)`.
    const open = (detail ?? "").indexOf("(");
    if (open < 0) {
      return "()";
    }
    let depth = 0;
    let close = open;
    for (let i = open; i < detail!.length; i++) {
      depth += detail![i] === "(" ? 1 : detail![i] === ")" ? -1 : 0;
      if (depth === 0) {
        close = i;
        break;
      }
    }
    const names = splitTopLevel(detail!.slice(open + 1, close))
      .map((p) => p.split("=")[0].trim().split(/\s+/).pop() ?? "")
      .filter(Boolean);
    return `(${escapeText(names.join(", "))})`;
  }
  const text = (detail ?? "").replace(/^func\s*/, "").trim();
  if (!text.startsWith("(")) {
    return "()";
  }
  let depth = 0;
  let end = 0;
  for (let i = 0; i < text.length; i++) {
    depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
    if (depth === 0) {
      end = i;
      break;
    }
  }
  const params = splitTopLevel(text.slice(1, end));
  // Go: either every parameter is named or none is.
  const named = params.some((p) => /\s/.test(p.trim()));
  const names = params.map((p) => (named ? p.trim().split(/\s+/)[0] : p.trim())).filter(Boolean);
  let result = text.slice(end + 1).trim();
  if (result.startsWith("(") && result.endsWith(")")) {
    result = result.slice(1, -1);
  }
  const shownResult = flattenNested(result);
  return `(${escapeText(names.map((n) => (named ? n : flattenNested(n))).join(", "))})${shownResult ? ` ${escapeText(shownResult)}` : ""}`;
}

function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const c of text) {
    if ("([{".includes(c)) {
      depth++;
    } else if (")]}".includes(c)) {
      depth--;
    }
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  if (current.trim()) {
    parts.push(current);
  }
  return parts;
}

/** Line and character (0-based) of an offset in a text. */
export function positionAt(text: string, offset: number): { line: number; character: number } {
  const before = text.slice(0, offset);
  return { line: before.split("\n").length - 1, character: offset - (before.lastIndexOf("\n") + 1) };
}

/** The text with comments blanked out, offsets kept: `#` comments ("hash"), or line and block comments ("c"). */
export function blankComments(text: string, style: "hash" | "c"): string {
  const pattern = style === "hash" ? /#[^\n]*/g : /\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  return text.replace(pattern, (m) => m.replace(/[^\n]/g, " "));
}

