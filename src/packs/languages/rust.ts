/** Rust: `impl [Trait for] Type` blocks declare methods and traits apart from the type; supertraits in `trait A: B {`. */
import { escapeText } from "../../classDiagram/ClassDiagramGenerator";
import type { LanguagePack } from "../types";
import { flattenNested, genericMember, genericMemberName } from "./members";

/** Splits at commas outside (), [], {} and <> (an arrow's `>` does not close). */
function splitParams(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if ("([{<".includes(c)) {
      depth++;
    } else if (")]}".includes(c) || (c === ">" && text[i - 1] !== "-")) {
      depth--;
    }
    if (c === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += c;
    }
  }
  return [...parts, current.trim()].filter(Boolean);
}

/** rust-analyzer's method detail `fn(&mut self, line: Line) -> Result<(), String>`: `add(line) Result<…>`; the receiver is left out. */
function rustMethod(name: string, detail: string | undefined): string | undefined {
  const m = /^fn\s*(?:<[\s\S]*?>)?\(([\s\S]*)\)\s*(?:->\s*([\s\S]+))?$/.exec((detail ?? "").trim());
  if (!m) {
    return undefined;
  }
  const names = splitParams(m[1])
    .filter((p) => !/^(&\s*('\w+\s+)?)?(mut\s+)?self\b/.test(p))
    .map((p) => p.split(":")[0].replace(/^mut\s+/, "").trim());
  return `${escapeText(name)}(${escapeText(names.join(", "))})${m[2] ? ` ${escapeText(flattenNested(m[2].trim()))}` : ""}`;
}

/** A path's last segment without generic arguments: `crate::shop::Store<T>` -> `Store`. */
const typeName = (s: string) => s.replace(/<[\s\S]*$/, "").split("::").pop()!.replace(/^[&*\s]+|\s+$/g, "");

// rust-analyzer names impl blocks `impl Type` and `impl Trait for Type` (generics after `impl` optional).
const IMPL = /^impl(?:\s*<[\s\S]*?>)?\s+(?:(!?[\w:<>, ]+?)\s+for\s+)?([\w:&* ]+(?:<[\s\S]*>)?)$/;

export const rust: LanguagePack = {
  id: "rust",
  label: "Rust",
  extensions: [".rs"],
  source: "language-extension",
  suggestedExtension: "rust-lang.rust-analyzer",
  apart: (name) => {
    const m = IMPL.exec(name.trim());
    if (!m || m[1]?.startsWith("!")) {
      return undefined;
    }
    return { type: typeName(m[2]), supertypes: m[1] ? [typeName(m[1])] : [] };
  },
  // Supertraits: `trait Store: Debug + Send {`; a `where` clause is not a base.
  header: { opens: "{", baseDepth: 0, cut: /\bwhere\b[\s\S]*$/ },
  member: (sym, method, params, name) => (method ? rustMethod(name ?? sym.name, sym.detail) : undefined) ?? genericMember(sym, method, params),
  memberName: genericMemberName,
};
