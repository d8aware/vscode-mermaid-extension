/**
 * Small, strict readers for the project files packs read: TOML (pyproject,
 * Cargo), XML elements (Maven), and comment stripping for C-like sources.
 * They read only what packs need and throw on what they cannot read, so a
 * pack's readProject falls back to "no facts" rather than guessing.
 */

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export interface TomlTable {
  [key: string]: TomlValue;
}

/** Parses TOML: tables, arrays of tables, dotted and quoted keys, strings, arrays, inline tables. */
export function parseToml(text: string): TomlTable {
  const root: TomlTable = {};
  let table = root;
  let i = 0;
  const fail = (what: string): never => {
    throw new Error(`TOML: ${what} at ${i}`);
  };
  const skip = (newlines: boolean) => {
    for (;;) {
      const c = text[i];
      if (c === " " || c === "\t" || c === "\r" || (newlines && c === "\n")) {
        i++;
      } else if (c === "#") {
        while (i < text.length && text[i] !== "\n") {
          i++;
        }
      } else {
        return;
      }
    }
  };
  const str = (): string => {
    const quote = text[i];
    const triple = text.startsWith(quote.repeat(3), i);
    i += triple ? 3 : 1;
    if (triple && text[i] === "\n") {
      i++;
    }
    let out = "";
    for (;;) {
      if (i >= text.length) {
        fail("unterminated string");
      }
      if (triple ? text.startsWith(quote.repeat(3), i) : text[i] === quote) {
        i += triple ? 3 : 1;
        return out;
      }
      if (!triple && text[i] === "\n") {
        fail("newline in string");
      }
      if (quote === '"' && text[i] === "\\") {
        const e = text[i + 1];
        const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", '"': '"', "\\": "\\", b: "\b", f: "\f" };
        if (e === "u" || e === "U") {
          const len = e === "u" ? 4 : 8;
          out += String.fromCodePoint(parseInt(text.slice(i + 2, i + 2 + len), 16));
          i += 2 + len;
        } else if (triple && (e === "\n" || e === " " || e === "\r")) {
          i++;
          skip(true);
        } else {
          out += map[e] ?? fail("bad escape");
          i += 2;
        }
        continue;
      }
      out += text[i++];
    }
  };
  const key = (): string[] => {
    const parts: string[] = [];
    for (;;) {
      skip(false);
      if (text[i] === '"' || text[i] === "'") {
        parts.push(str());
      } else {
        const m = /^[A-Za-z0-9_-]+/.exec(text.slice(i, i + 200));
        if (!m) {
          fail("bad key");
        }
        parts.push(m![0]);
        i += m![0].length;
      }
      skip(false);
      if (text[i] !== ".") {
        return parts;
      }
      i++;
    }
  };
  const value = (): TomlValue => {
    skip(false);
    const c = text[i];
    if (c === '"' || c === "'") {
      return str();
    }
    if (c === "[") {
      i++;
      const list: TomlValue[] = [];
      for (;;) {
        skip(true);
        if (text[i] === "]") {
          i++;
          return list;
        }
        list.push(value());
        skip(true);
        if (text[i] === ",") {
          i++;
        } else if (text[i] !== "]") {
          fail("bad array");
        }
      }
    }
    if (c === "{") {
      i++;
      const inline: TomlTable = {};
      skip(false);
      if (text[i] === "}") {
        i++;
        return inline;
      }
      for (;;) {
        const k = key();
        if (text[i] !== "=") {
          fail("expected =");
        }
        i++;
        assign(inline, k, value());
        skip(false);
        if (text[i] === ",") {
          i++;
        } else if (text[i] === "}") {
          i++;
          return inline;
        } else {
          fail("bad inline table");
        }
      }
    }
    const m = /^[^\s,\]}#]+/.exec(text.slice(i, i + 100));
    if (!m) {
      fail("bad value");
    }
    i += m![0].length;
    const raw = m![0];
    return raw === "true" ? true : raw === "false" ? false : /^[+-]?\d[\d_]*(\.\d+)?$/.test(raw) ? Number(raw.replace(/_/g, "")) : raw;
  };
  const descend = (from: TomlTable, parts: string[], arrayLast: boolean): TomlTable => {
    let t = from;
    parts.forEach((part, n) => {
      const last = n === parts.length - 1;
      let next = t[part];
      if (last && arrayLast) {
        const list = (Array.isArray(next) ? next : (t[part] = [])) as TomlValue[];
        const fresh: TomlTable = {};
        list.push(fresh);
        t = fresh;
        return;
      }
      if (Array.isArray(next)) {
        next = next[next.length - 1];
      }
      if (next === undefined) {
        next = t[part] = {};
      }
      if (typeof next !== "object" || Array.isArray(next)) {
        fail(`key ${part} is not a table`);
      }
      t = next as TomlTable;
    });
    return t;
  };
  const assign = (t: TomlTable, parts: string[], v: TomlValue) => {
    descend(t, parts.slice(0, -1), false)[parts[parts.length - 1]] = v;
  };

  for (;;) {
    skip(true);
    if (i >= text.length) {
      return root;
    }
    if (text[i] === "[") {
      const array = text[i + 1] === "[";
      i += array ? 2 : 1;
      const parts = key();
      if (!text.startsWith(array ? "]]" : "]", i)) {
        fail("bad table header");
      }
      i += array ? 2 : 1;
      table = descend(root, parts, array);
      continue;
    }
    const k = key();
    if (text[i] !== "=") {
      fail("expected =");
    }
    i++;
    assign(table, k, value());
    skip(false);
    if (i < text.length && text[i] !== "\n") {
      fail("expected end of line");
    }
  }
}

/** A TOML table at a dotted path, or undefined. */
export function tomlTable(doc: TomlTable | undefined, ...parts: string[]): TomlTable | undefined {
  let t: TomlValue | undefined = doc;
  for (const part of parts) {
    t = t && typeof t === "object" && !Array.isArray(t) ? t[part] : undefined;
  }
  return t && typeof t === "object" && !Array.isArray(t) ? t : undefined;
}

/** Removes `//` and `/* *\/` comments and the contents of "…" and '…' literals (kept as empty quotes), preserving line breaks. */
export function stripCLike(text: string, keepStrings = false): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n") {
          out += "\n";
        }
        i++;
      }
      i++;
    } else if (c === '"' || c === "'") {
      let body = "";
      for (i++; i < text.length && text[i] !== c && text[i] !== "\n"; i++) {
        if (text[i] === "\\") {
          body += text[i++];
        }
        body += text[i];
      }
      out += c + (keepStrings ? body : "") + c;
    } else {
      out += c;
    }
  }
  return out;
}

/** Removes `#` comments (Python, Ruby, shell), leaving string contents alone except where a `#` starts a comment. */
export function stripHashComments(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let quote = "";
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quote) {
          if (c === "\\") {
            i++;
          } else if (c === quote) {
            quote = "";
          }
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === "#") {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join("\n");
}

/** Removes XML comments. */
export function stripXmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

/** The text inside each `<name>…</name>` element at any depth (no attributes on nested repeats needed). */
export function xmlElements(text: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push(m[1]);
  }
  return out;
}

/** The trimmed text of the first `<name>` element, or undefined. */
export function xmlText(text: string, name: string): string | undefined {
  return xmlElements(text, name)[0]?.trim() || undefined;
}

/** `text` with every `<name>…</name>` element removed (to read a parent's own fields). */
export function xmlWithout(text: string, ...names: string[]): string {
  return names.reduce((t, name) => t.replace(new RegExp(`<${name}(?:\\s[^>]*)?>[\\s\\S]*?</${name}>`, "g"), ""), text);
}
