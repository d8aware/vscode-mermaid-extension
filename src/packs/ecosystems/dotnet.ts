/** .NET: solutions and projects, linked by `<ProjectReference>`. */
import * as fs from "fs";
import * as path from "path";
import type { EcosystemPack } from "../types";
import { stripCLike } from "./formats";

const DECLARATION_START =
  /^(namespace|using|public|internal|private|protected|static|sealed|abstract|partial|class|record|struct|interface|enum|delegate|readonly|unsafe|file|extern|\[|#)/;

/** C#: `static Main`, or top-level statements (the first statement after usings is not a declaration). */
function csharpEntry(text: string): string | undefined {
  const code = stripCLike(text);
  if (/\bstatic\s+(?:async\s+)?(?:void|int|Task(?:\s*<\s*int\s*>)?)\s+Main\s*\(/.test(code)) {
    return "static Main method";
  }
  const first = code
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !/^(global\s+)?using\b[^(]*;$/.test(l) && !l.startsWith("#") && !/^\[assembly:/.test(l));
  return first && !DECLARATION_START.test(first) ? "top-level statements" : undefined;
}

export const dotnet: EcosystemPack = {
  id: "dotnet",
  label: ".NET",
  markers: [
    { kind: ".NET solution", pattern: "*.sln", matches: (f) => f.endsWith(".sln"), priority: 30 },
    { kind: ".NET project", pattern: "*.csproj", matches: (f) => f.endsWith(".csproj"), priority: 40 },
  ],
  code: [
    {
      files: (f) => f.endsWith(".cs"),
      // using directives: `using A.B;`, `global using`, `using static A.B.C;`, `using X = A.B.C;`.
      read: (text) =>
        [...stripCLike(text).matchAll(/^\s*(?:global\s+)?using\s+(?:static\s+)?(?:\w+\s*=\s*)?([A-Za-z_][\w.]*)\s*;/gm)].map((m) => m[1]),
      declares: (text) => [...stripCLike(text).matchAll(/^\s*namespace\s+([A-Za-z_][\w.]*)/gm)].map((m) => m[1]),
      separator: ".",
      entry: csharpEntry,
      rule: "using",
    },
  ],
  readProject: (dir, fileNames) => ({
    paths: fileNames
      .filter((f) => f.endsWith(".csproj"))
      .flatMap((f) =>
        [...fs.readFileSync(path.join(dir, f), "utf8").matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => ({
          path: path.resolve(dir, m[1].replace(/\\/g, "/")),
          rule: "<ProjectReference>",
        }))
      ),
  }),
};
