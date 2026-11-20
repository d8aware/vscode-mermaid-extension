#!/usr/bin/env node
/**
 * Records a language server's answers for an explorer example, so the
 * ProviderGraph goldens replay them without the server (no gopls in CI).
 *
 *   npm run compile && node scripts/record-provider-answers.js test-files/explorer/go-orders.views
 *   node scripts/record-provider-answers.js test-files/explorer/rust-orders.views -- rust-analyzer
 *
 * Talks LSP to a language server directly (default `gopls serve`, on PATH or
 * in ~/go/bin; after `--`, any server command) and
 * runs every walk in views.json through ProviderGraph, saving each answer to
 * `answers.json` keyed by request, with paths relative to the example. VS Code
 * reaches the same server through the Go extension, which passes these
 * answers through; run the extension on the example to compare.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ProviderGraph } = require("../out/classDiagram/ProviderGraph");

const KINDS = ["File", "Module", "Namespace", "Package", "Class", "Method", "Property", "Field", "Constructor", "Enum",
  "Interface", "Function", "Variable", "Constant", "String", "Number", "Boolean", "Array", "Object", "Key", "Null",
  "EnumMember", "Struct", "Event", "Operator", "TypeParameter"];

function lspClient(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "inherit"] });
  let buffer = Buffer.alloc(0);
  let next = 1;
  const pending = new Map();
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const header = buffer.indexOf("\r\n\r\n");
      if (header < 0) return;
      const length = Number(/Content-Length: (\d+)/i.exec(buffer.slice(0, header).toString())[1]);
      if (buffer.length < header + 4 + length) return;
      const message = JSON.parse(buffer.slice(header + 4, header + 4 + length).toString());
      buffer = buffer.slice(header + 4 + length);
      if (message.id !== undefined && pending.has(message.id) && message.method === undefined) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      } else if (message.id !== undefined && message.method) {
        send({ jsonrpc: "2.0", id: message.id, result: null }); // workspace/configuration etc.
      }
    }
  });
  const send = (message) => {
    const body = Buffer.from(JSON.stringify(message));
    child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    child.stdin.write(body);
  };
  return {
    request: (method, params) =>
      new Promise((resolve, reject) => {
        const id = next++;
        pending.set(id, { resolve, reject });
        send({ jsonrpc: "2.0", id, method, params });
      }),
    notify: (method, params) => send({ jsonrpc: "2.0", method, params }),
    close: () => child.kill(),
  };
}

async function main() {
  const viewsDir = path.resolve(process.argv[2] || "test-files/explorer/go-orders.views");
  const config = JSON.parse(fs.readFileSync(path.join(viewsDir, "views.json"), "utf8"));
  const root = path.resolve(viewsDir, config.example);
  const dash = process.argv.indexOf("--");
  const gopls = [path.join(os.homedir(), "go", "bin", "gopls"), "gopls"].find((p) => p === "gopls" || fs.existsSync(p));
  const [command, ...args] = dash > 0 ? process.argv.slice(dash + 1) : [gopls, "serve"];
  const lsp = lspClient(command, args, root);
  const uri = (file) => "file://" + file;
  const fromUri = (u) => decodeURIComponent(u.replace(/^file:\/\//, ""));
  await lsp.request("initialize", {
    processId: process.pid,
    rootUri: uri(root),
    workspaceFolders: [{ uri: uri(root), name: "example" }],
    capabilities: {
      textDocument: { documentSymbol: { hierarchicalDocumentSymbolSupport: true }, definition: { linkSupport: true } },
      window: { workDoneProgress: true },
    },
  });
  lsp.notify("initialized", {});

  const answers = {};
  const rel = (file) => path.relative(root, file).split(path.sep).join("/");
  /** Records the answer (or the error, replayed as a thrown error) under `key`. */
  const record = async (key, run) => {
    try {
      const value = await run();
      answers[key] = value === undefined ? { undefined: true } : value;
      return value;
    } catch (error) {
      answers[key] = { error: error.message };
      throw error;
    }
  };
  const toSym = (s) => ({ name: s.name, kind: KINDS[s.kind - 1], detail: s.detail || undefined, range: s.range, selectionRange: s.selectionRange, children: (s.children || []).map(toSym) });
  const toLoc = (l) => (l.targetUri ? { file: fromUri(l.targetUri), range: l.targetSelectionRange || l.targetRange } : { file: fromUri(l.uri), range: l.range });
  // Paths inside the example are stored relative; others (GOROOT) as they are.
  // Files outside the example keep only their last folder and name (no machine or user in committed recordings).
  const external = (file) => "/external/" + file.split(/[\\/]/).slice(-2).join("/");
  const relLocs = (locs) => locs.map((l) => ({ file: l.file.startsWith(root + path.sep) ? rel(l.file) : external(l.file), range: l.range }));
  const absLocs = (locs) => locs && locs.map((l) => ({ ...l, file: path.isAbsolute(l.file) ? l.file : path.join(root, l.file) }));
  const at = (file, pos) => `${rel(file)}:${pos.line}:${pos.character}`;
  const position = (file, pos) => ({ textDocument: { uri: uri(file) }, position: pos });
  const locations = async (method, params) => relLocs([].concat((await lsp.request(method, params)) || []).map(toLoc));
  const hierarchy = async (file, pos, method) => {
    const items = await lsp.request("textDocument/prepareTypeHierarchy", position(file, pos));
    if (!items || !items.length) return undefined;
    const found = await lsp.request(method, { item: items[0] });
    return relLocs((found || []).map((i) => ({ file: fromUri(i.uri), range: i.selectionRange })));
  };
  const providers = {
    documentSymbols: (file) =>
      record(`documentSymbols ${rel(file)}`, async () => ((await lsp.request("textDocument/documentSymbol", { textDocument: { uri: uri(file) } })) || []).map(toSym)),
    supertypes: async (file, pos) => absLocs(await record(`supertypes ${at(file, pos)}`, () => hierarchy(file, pos, "typeHierarchy/supertypes"))),
    subtypes: async (file, pos) => absLocs(await record(`subtypes ${at(file, pos)}`, () => hierarchy(file, pos, "typeHierarchy/subtypes"))),
    implementations: async (file, pos) => absLocs(await record(`implementations ${at(file, pos)}`, () => locations("textDocument/implementation", position(file, pos)))),
    definition: async (file, pos) => absLocs(await record(`definition ${at(file, pos)}`, () => locations("textDocument/definition", position(file, pos)))),
    text: async (file) => fs.readFileSync(file, "utf8"),
    typeDefinition: async (file, pos) => absLocs(await record(`typeDefinition ${at(file, pos)}`, () => locations("textDocument/typeDefinition", position(file, pos)))),
    references: async (file, pos) =>
      absLocs(await record(`references ${at(file, pos)}`, () => locations("textDocument/references", { ...position(file, pos), context: { includeDeclaration: true } }))),
    siblings: async (file) => {
      const dir = path.dirname(file);
      const names = await record(`siblings ${rel(dir) || "."}`, async () =>
        fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort().map((f) => rel(path.join(dir, f)))
      );
      return names.map((f) => path.join(root, f));
    },
  };

  // Wait until the server has loaded the project: symbols answer, then references to the first one
  // (some servers list symbols from syntax alone, long before they can resolve anything).
  const first = path.join(root, Object.values(config.views)[0].start);
  for (let i = 0; i < 240; i++) {
    const syms = await lsp.request("textDocument/documentSymbol", { textDocument: { uri: uri(first) } }).catch(() => null);
    const sym = syms && syms[0];
    const refs = sym && (await lsp.request("textDocument/references", { ...position(first, (sym.selectionRange || sym.location.range).start), context: { includeDeclaration: true } }).catch(() => null));
    if (refs && refs.length) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  for (const [name, walk] of Object.entries(config.views)) {
    const graph = new ProviderGraph(providers, { root, inWorkspace: (f) => f.startsWith(root + path.sep), includeTestFiles: false });
    const origin = await graph.start(path.join(root, walk.start));
    for (const id of origin) await graph.expand(id);
    for (const id of walk.light) await graph.expand(id);
    console.log(`${name}: ${origin.join(", ")} + ${walk.light.join(", ") || "(none)"}`);
  }
  const sorted = Object.fromEntries(Object.keys(answers).sort().map((k) => [k, answers[k]]));
  fs.writeFileSync(path.join(viewsDir, config.answers), JSON.stringify(sorted, null, 1) + "\n");
  console.log(`${Object.keys(sorted).length} answers -> ${path.join(viewsDir, config.answers)}`);
  await lsp.request("shutdown", null).catch(() => {});
  lsp.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
