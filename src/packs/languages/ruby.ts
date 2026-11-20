/** Ruby: `class A < B` (the header ends at the end of the line). */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const ruby: LanguagePack = {
  id: "ruby",
  label: "Ruby",
  extensions: [".rb"],
  source: "language-extension",
  header: { opens: "\n", baseDepth: 0 },
  member: genericMember,
  memberName: genericMemberName,
};
