/** JVM: Maven (pom.xml names and dependencies) and Gradle (recognised by marker); Java and Kotlin imports by package. */
import * as fs from "fs";
import * as path from "path";
import type { EcosystemPack, ProjectFacts } from "../types";
import { stripCLike, stripXmlComments, xmlElements, xmlText, xmlWithout } from "./formats";

/** Maven's standard directory layout, where the build declares no `<sourceDirectory>`. */
const MAVEN_SOURCES = ["src/main/java", "src/main/kotlin"];

function readPom(dir: string): ProjectFacts {
  const pom = stripXmlComments(fs.readFileSync(path.join(dir, "pom.xml"), "utf8"));
  const project = xmlElements(pom, "project")[0] ?? pom;
  const parent = xmlElements(project, "parent")[0];
  const own = xmlWithout(project, "parent", "dependencies", "dependencyManagement", "build", "profiles", "modules", "properties", "reporting", "plugins");
  const groupId = xmlText(own, "groupId") ?? (parent ? xmlText(parent, "groupId") : undefined);
  const artifactId = xmlText(own, "artifactId");
  const facts: ProjectFacts = {};
  if (groupId && artifactId) {
    facts.names = [{ namespace: "maven", name: `${groupId}:${artifactId}`, source: "pom.xml groupId:artifactId" }];
  }
  const substitute = (v: string | undefined) => v?.replace(/\$\{project\.groupId\}/g, groupId ?? "").replace(/\$\{project\.artifactId\}/g, artifactId ?? "");
  const declared = xmlWithout(project, "dependencyManagement", "build", "profiles", "reporting");
  facts.dependencies = xmlElements(declared, "dependencies")
    .flatMap((deps) => xmlElements(deps, "dependency"))
    .map((dep) => ({ g: substitute(xmlText(dep, "groupId")), a: substitute(xmlText(dep, "artifactId")) }))
    .filter((d) => d.g && d.a)
    .map((d) => ({ namespace: "maven", name: `${d.g}:${d.a}`, rule: "pom.xml dependency" }));
  const build = xmlElements(project, "build")[0];
  const sourceDirectory = build ? xmlText(xmlWithout(build, "plugins", "pluginManagement"), "sourceDirectory") : undefined;
  const roots = sourceDirectory ? [sourceDirectory.replace(/^\$\{(project\.)?basedir\}\/?/, "")] : MAVEN_SOURCES;
  facts.sourceRoots = roots
    .map((r) => path.resolve(dir, r))
    .filter((r) => fs.existsSync(r))
    .map((r) => ({ dir: r, rule: sourceDirectory ? "pom.xml sourceDirectory" : "Maven standard directory layout" }));
  return facts;
}

const JVM_SOURCE = /\.(java|kt|kts)$/;

export const jvm: EcosystemPack = {
  id: "jvm",
  label: "JVM (Maven, Gradle)",
  markers: [
    { kind: "Maven project", pattern: "pom.xml", matches: (f) => f === "pom.xml", priority: 150 },
    {
      kind: "Gradle build",
      pattern: "build.gradle / build.gradle.kts / settings.gradle(.kts)",
      matches: (f) => /^(build|settings)\.gradle(\.kts)?$/.test(f),
      priority: 155,
    },
  ],
  readProject: (dir, fileNames) => {
    if (fileNames.includes("pom.xml")) {
      return readPom(dir);
    }
    // Gradle: the standard source sets (Gradle's documented default layout).
    const roots = fileNames.some((f) => /^build\.gradle(\.kts)?$/.test(f))
      ? MAVEN_SOURCES.map((r) => path.resolve(dir, r)).filter((r) => fs.existsSync(r))
      : [];
    return roots.length ? { sourceRoots: roots.map((r) => ({ dir: r, rule: "Gradle default source set" })) } : {};
  },
  code: [
    {
      files: (f) => JVM_SOURCE.test(f),
      // `import a.b.C`, `import a.b.*`, `import static a.b.C.m` (Java); Kotlin's `import a.b.C as D`.
      read: (text) =>
        [...stripCLike(text).matchAll(/^\s*import\s+(?:static\s+)?([A-Za-z_][\w.]*)(?:\.\*)?\s*(?:as\s+\w+)?\s*;?\s*$/gm)].map((m) => m[1]),
      declares: (text) => [...stripCLike(text).matchAll(/^\s*package\s+([A-Za-z_][\w.]*)/gm)].map((m) => m[1]),
      separator: ".",
      entry: (text) => {
        const code = stripCLike(text);
        return /\bpublic\s+static\s+void\s+main\s*\(/.test(code) || /^\s*fun\s+main\s*\(/m.test(code) ? "main method" : undefined;
      },
      rule: "import",
    },
  ],
};
