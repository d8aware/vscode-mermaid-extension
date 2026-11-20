/** PHP: `extends` / `implements` headers; visibility and parameters via the generic member rules. */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const php: LanguagePack = {
  id: "php",
  label: "PHP",
  extensions: [".php"],
  source: "language-extension",
  suggestedExtension: "bmewburn.vscode-intelephense-client",
  header: { opens: "{", baseDepth: 0 },
  member: genericMember,
  memberName: genericMemberName,
};
