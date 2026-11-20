/** PHP: Composer packages and their `require`. */
import * as fs from "fs";
import * as path from "path";
import type { EcosystemPack, ProjectFacts } from "../types";
import { stripCLike } from "./formats";

/** `use A\B\C;`, `use A\B\{C, D as E};`, `use function A\f;` (leading `\` dropped). */
function readUses(text: string): string[] {
  const out: string[] = [];
  for (const m of stripCLike(text).matchAll(/^\s*use\s+(?:function\s+|const\s+)?([^;]+);/gm)) {
    const body = m[1].replace(/\s+/g, " ").trim();
    const group = /^([\\\w]+)\\\{(.*)\}$/.exec(body);
    const items = group ? group[2].split(",").map((x) => `${group[1]}\\${x.trim()}`) : body.split(",");
    for (const item of items) {
      const name = item.trim().split(/\s+as\s+/i)[0].replace(/^\\/, "");
      if (/^[A-Za-z_][\w\\]*$/.test(name)) {
        out.push(name);
      }
    }
  }
  return out;
}

/** `require`/`include` of a literal path: relative to the including file's folder. */
function readIncludes(text: string): string[] {
  return [...stripCLike(text, true).matchAll(/\b(?:require|include)(?:_once)?\s*\(?\s*(["'])([^"']+\.php)\1/g)].map((m) => "file:" + m[2]);
}

export const composer: EcosystemPack = {
  id: "composer",
  label: "PHP (Composer)",
  markers: [{ kind: "Composer package", pattern: "composer.json", matches: (f) => f === "composer.json", priority: 50 }],
  readProject: (dir, fileNames) => {
    if (!fileNames.includes("composer.json")) {
      return {};
    }
    let json: any;
    try {
      json = JSON.parse(fs.readFileSync(path.join(dir, "composer.json"), "utf8"));
    } catch {
      return {};
    }
    const facts: ProjectFacts = {
      names: typeof json?.name === "string" && json.name ? [{ namespace: "composer", name: json.name, source: "composer.json" }] : [],
      dependencies: Object.keys({ ...json?.require, ...json?.["require-dev"] }).map((name) => ({
        namespace: "composer",
        name,
        rule: "composer.json require",
      })),
    };
    const roots = Object.values<unknown>({ ...json?.autoload?.["psr-4"] })
      .flatMap((v) => (Array.isArray(v) ? v : [v]))
      .filter((v): v is string => typeof v === "string" && v !== "");
    if (roots.length) {
      facts.sourceRoots = roots.map((r) => ({ dir: path.resolve(dir, r), rule: "composer.json autoload psr-4" }));
    }
    const bins = (Array.isArray(json?.bin) ? json.bin : []).filter((b: unknown): b is string => typeof b === "string");
    if (bins.length) {
      facts.entries = bins.map((b: string) => ({ file: path.resolve(dir, b), rule: "composer.json bin" }));
    }
    return facts;
  },
  code: [
    {
      files: (f) => f.endsWith(".php"),
      read: (text) => [...readUses(text), ...readIncludes(text)],
      resolve: (spec, fromFile, context) => {
        if (!spec.startsWith("file:")) {
          return undefined; // a namespace: resolved through declares
        }
        const target = path.resolve(path.dirname(fromFile), spec.slice(5));
        return context.isFile(target) ? target : undefined;
      },
      declares: (text) => [...stripCLike(text).matchAll(/^\s*namespace\s+([A-Za-z_][\w\\]*)\s*[;{]/gm)].map((m) => m[1]),
      separator: "\\",
      rule: "use / require",
    },
  ],
};
