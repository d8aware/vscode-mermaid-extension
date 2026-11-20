/** C#: `where` constraints are not base types; members arrive as `Name(params) : Type` (generic member rules). */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const csharp: LanguagePack = {
  id: "csharp",
  label: "C#",
  extensions: [".cs"],
  source: "language-extension",
  suggestedExtension: "ms-dotnettools.csharp",
  header: { opens: "{", baseDepth: 0, cut: /\bwhere\b[\s\S]*$/ },
  member: genericMember,
  memberName: genericMemberName,
};
