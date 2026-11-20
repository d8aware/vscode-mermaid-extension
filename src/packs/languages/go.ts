/** Go: receiver methods, exported-by-capital visibility, `func(…)` signatures, no inheritance headers. */
import { escapeText } from "../../classDiagram/ClassDiagramGenerator";
import type { LanguagePack } from "../types";
import { flattenNested, signature } from "./members";

const RECEIVER = /^\((\*?)([A-Za-z_]\w*)(?:\[[^\]]*\])?\)\.(\w+)$/;

export const go: LanguagePack = {
  id: "go",
  label: "Go",
  extensions: [".go"],
  source: "language-extension",
  suggestedExtension: "golang.go",
  testFile: /_test\.go$/,
  // `(*T).M` / `(T).M` belongs to type T of the same package (the Go receiver syntax).
  receiver: (name) => {
    const m = RECEIVER.exec(name);
    return m ? { type: m[2], method: m[3] } : undefined;
  },
  // gopls reports other named types (`type Status int`) as Class.
  classKind: "type",
  member: (sym, method, _params, name) => {
    const shown = name ?? sym.name;
    const visibility = /^[A-Z]/.test(shown) ? "+" : "-";
    return method
      ? `${visibility}${escapeText(shown)}${signature(sym.detail)}`
      : `${visibility}${escapeText(shown)}${sym.detail ? `: ${escapeText(flattenNested(sym.detail))}` : ""}`;
  },
  memberName: (sym) => sym.name,
};
