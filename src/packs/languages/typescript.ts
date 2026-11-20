/**
 * TypeScript: explored with our own analysis (ts-morph) by default. The
 * header and member rules apply when its language extension answers instead
 * (the comparison examples, and "in" from references).
 */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const typescript: LanguagePack = {
  id: "typescript",
  label: "TypeScript",
  extensions: [".ts", ".tsx", ".mts", ".cts"],
  source: "analysis",
  testFile: /\.(spec|test)\.[cm]?[jt]sx?$/,
  header: { opens: "{", baseDepth: 0 },
  member: genericMember,
  memberName: genericMemberName,
};
