/**
 * Python: `class A(B, C):` (base names inside the parentheses, the body opens
 * at `:`). Visibility by the language's naming rules: `__name` is private
 * (name mangling), `_name` internal (PEP 8), dunder methods and other names
 * public.
 */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

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
};
