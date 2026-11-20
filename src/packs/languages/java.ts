/** Java and Kotlin: test classes by the JUnit naming conventions Maven Surefire runs by default. */
import type { LanguagePack } from "../types";
import { genericMember, genericMemberName } from "./members";

export const java: LanguagePack = {
  id: "java",
  label: "Java / Kotlin",
  extensions: [".java", ".kt"],
  source: "language-extension",
  suggestedExtension: "redhat.java",
  // Maven Surefire's default includes: Test*, *Test, *Tests, *TestCase.
  testFile: /^(Test\w*|\w*Tests?|\w*TestCase)\.(java|kt)$/,
  header: { opens: "{", baseDepth: 0 },
  member: genericMember,
  memberName: genericMemberName,
};
