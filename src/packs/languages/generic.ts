/**
 * The generic language pack: any language whose extension answers VS Code's
 * provider commands. Language packs below only add what their language does
 * differently.
 */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const generic: LanguagePack = {
  id: "generic",
  label: "Any language with a language extension",
  extensions: [".swift", ".scala", ".dart", ".cpp", ".cc", ".cxx", ".hpp", ".h"],
  source: "language-extension",
  header: { opens: "{", baseDepth: 0 },
  member: genericMember,
  memberName: genericMemberName,
};
