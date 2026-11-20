/**
 * Go readers for the landscape: `go.mod` directives and the import paths of a
 * `.go` file. Both follow the Go specification's syntax only (comments,
 * interpreted and raw strings, import blocks); nothing is guessed.
 */

export interface GoMod {
  /** The `module` path. */
  module?: string;
  /** Module paths from `require`. */
  require: string[];
  /** `replace` directives whose target is a local directory (`./`, `../` or absolute). */
  localReplace: { module: string; dir: string }[];
}

const unquote = (s: string) => s.replace(/^"(.*)"$/, "$1").replace(/^`(.*)`$/, "$1");

/** Splits `go.mod` into directives: `verb args` lines, with `verb ( ... )` blocks expanded. */
function directives(text: string): { verb: string; args: string[] }[] {
  const out: { verb: string; args: string[] }[] = [];
  let block: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) {
      continue;
    }
    if (block) {
      if (line === ")") {
        block = undefined;
      } else {
        out.push({ verb: block, args: line.split(/\s+/) });
      }
      continue;
    }
    const [verb, ...args] = line.split(/\s+/);
    if (args.length === 1 && args[0] === "(") {
      block = verb;
    } else {
      out.push({ verb, args });
    }
  }
  return out;
}

export function parseGoMod(text: string): GoMod {
  const mod: GoMod = { require: [], localReplace: [] };
  for (const { verb, args } of directives(text)) {
    if (verb === "module" && args[0]) {
      mod.module = unquote(args[0]);
    } else if (verb === "require" && args[0]) {
      mod.require.push(unquote(args[0]));
    } else if (verb === "replace") {
      const arrow = args.indexOf("=>");
      const target = arrow >= 0 ? args[arrow + 1] : undefined;
      if (args[0] && target && /^(\.{1,2}\/|\/)/.test(unquote(target))) {
        mod.localReplace.push({ module: unquote(args[0]), dir: unquote(target) });
      }
    }
  }
  return mod;
}

/** `go.work` `use` directories. */
export function parseGoWork(text: string): string[] {
  return directives(text)
    .filter((d) => d.verb === "use" && d.args[0])
    .map((d) => unquote(d.args[0]));
}

/** Replaces comments with spaces, leaving string and rune literals intact. */
function stripComments(src: string): string {
  let out = "";
  for (let i = 0; i < src.length; ) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        i++;
      }
      out += " ";
    } else if (c === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).includes("\n") ? "\n" : " ";
      i = stop;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        j += c !== "`" && src[j] === "\\" ? 2 : 1;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/**
 * Import paths of a Go source file: the `import` declarations that follow the
 * `package` clause (Go allows them nowhere else).
 */
export function parseGoImports(src: string): string[] {
  const text = stripComments(src);
  const pkg = /^\s*package\s+\w+\s*;?/.exec(text);
  if (!pkg) {
    return [];
  }
  const paths: string[] = [];
  const literal = /"((?:[^"\\\n]|\\.)*)"|`([^`]*)`/g;
  const decl = /\s*import\s*(\(([^)]*)\)|(?:[\w.]+\s+)?("(?:[^"\\\n]|\\.)*"|`[^`]*`))\s*;?/y;
  decl.lastIndex = pkg[0].length;
  for (let m = decl.exec(text); m; m = decl.exec(text)) {
    const body = m[2] ?? m[3];
    for (const s of body.matchAll(literal)) {
      paths.push(s[1] ?? s[2]);
    }
  }
  return paths;
}
