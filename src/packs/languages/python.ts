/**
 * Python: `class A(B, C):` (base names inside the parentheses, the body opens
 * at `:`). Visibility by the language's naming rules: `__name` is private
 * (name mangling), `_name` internal (PEP 8), dunder methods and other names
 * public.
 */
import type { LanguagePack } from "../types";
import { blankComments, genericMember, genericMemberName, positionAt } from "./members";

/**
 * A package's `__init__.py` re-exports what it imports: `from .order import
 * Order, Line as L` (each name), `from .store import *` (the module).
 */
function pythonReexports(text: string, filePath: string) {
  if (!/(^|[/\\])__init__\.py$/.test(filePath)) {
    return [];
  }
  const code = blankComments(text, "hash");
  const out: { line: number; character: number; all?: boolean }[] = [];
  for (const m of code.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+(\([^)]*\)|[^\n]*)/gm)) {
    const listStart = m.index! + m[0].length - m[3].length;
    for (const name of m[3].matchAll(/\*|[A-Za-z_]\w*(?:\s+as\s+[A-Za-z_]\w*)?/g)) {
      if (name[0] !== "*") {
        out.push(positionAt(text, listStart + name.index!));
      } else if (m[2]) {
        // The module: its last dotted segment.
        const moduleEnd = m.index! + m[0].indexOf(m[2], m[0].indexOf("from") + 4) + m[2].length;
        out.push({ ...positionAt(text, moduleEnd - m[2].split(".").pop()!.length), all: true });
      }
    }
  }
  return out;
}

export const python: LanguagePack = {
  id: "python",
  label: "Python",
  extensions: [".py"],
  source: "language-extension",
  suggestedExtension: "ms-python.python",
  testFile: /(^|[/\\])test_[^/\\]*\.py$|_test\.py$/,
  header: { opens: ":", baseDepth: 1 },
  member: (sym, method, params) => {
    const name = sym.name;
    const visibility = /^__\w*[^_]_?$/.test(name) && !/^__\w+__$/.test(name) ? "-" : /^_[^_]/.test(name) ? "#" : "+";
    return visibility + genericMember(sym, method, params);
  },
  memberName: genericMemberName,
  reexports: pythonReexports,
};
