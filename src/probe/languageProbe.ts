/**
 * "Check Explorer Language Support": asks the installed language extensions,
 * through VS Code's built-in provider commands, what they can tell the
 * explorer about one file, and reports per explorer direction what the
 * explorer will use: the extension's answer, a language pack's fallback rule,
 * or nothing. Pack authors use the detailed tables to write a new pack.
 *
 * Note: an empty answer cannot be told apart from "no extension provides
 * this"; VS Code's commands return [] or undefined in both cases.
 */
import * as path from "path";
import * as vscode from "vscode";
import { languagePackFor, rulesFor } from "../packs";

const TIMEOUT_MS = 15000;
const MAX_TARGETS = 3;
const MAX_MEMBERS = 20;

const TYPE_KINDS = new Set([
  vscode.SymbolKind.Class,
  vscode.SymbolKind.Interface,
  vscode.SymbolKind.Struct,
  vscode.SymbolKind.Enum,
]);
const MEMBER_KINDS = new Set([vscode.SymbolKind.Property, vscode.SymbolKind.Field]);

export interface Call {
  /** Explorer use, e.g. "down: implementers". */
  purpose: string;
  command: string;
  status: "answered" | "empty" | "timeout" | "error";
  ms: number;
  count?: number;
  /** Short, deterministic summary of the answer (names, files). */
  sample?: string[];
  error?: string;
}

export interface TargetProbe {
  name: string;
  kind: string;
  line: number;
  member?: string;
  calls: Call[];
}

export interface ProbeResult {
  file: string;
  languageId: string;
  vscodeVersion: string;
  extensions: { id: string; version: string; active: boolean }[];
  documentSymbols: Call;
  symbolKinds: Record<string, number>;
  documentLinks: Call;
  targets: TargetProbe[];
}

const kindName = (kind: vscode.SymbolKind) => vscode.SymbolKind[kind] ?? String(kind);
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

async function timed<T>(
  purpose: string,
  command: string,
  run: () => Thenable<T>,
  summarize: (value: T) => { count: number; sample?: string[] }
): Promise<{ call: Call; value?: T }> {
  const start = Date.now();
  try {
    const value = await Promise.race([
      Promise.resolve(run()),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), TIMEOUT_MS)),
    ]);
    const ms = Date.now() - start;
    if (value === "timeout") {
      return { call: { purpose, command, status: "timeout", ms } };
    }
    const { count, sample } = summarize(value as T);
    return { call: { purpose, command, status: count ? "answered" : "empty", ms, count, sample }, value: value as T };
  } catch (error) {
    return { call: { purpose, command, status: "error", ms: Date.now() - start, error: String((error as Error)?.message ?? error) } };
  }
}

type Located = vscode.Location | vscode.LocationLink;
const uriOf = (l: Located) => ("targetUri" in l ? l.targetUri : l.uri);
const rangeOf = (l: Located) => ("targetUri" in l ? l.targetSelectionRange ?? l.targetRange : l.range);

function where(uri: vscode.Uri, line?: number): string {
  const rel = vscode.workspace.asRelativePath(uri, false);
  return line === undefined ? rel : `${rel}:${line + 1}`;
}

function locations(value: Located[] | Located | undefined) {
  const list = !value ? [] : Array.isArray(value) ? value : [value];
  const files = new Set(list.map((l) => uriOf(l).toString()));
  return {
    count: list.length,
    sample: [
      `${list.length} location(s) in ${files.size} file(s)`,
      ...list
        .map((l) => where(uriOf(l), rangeOf(l).start.line))
        .sort(compare)
        .slice(0, 5),
    ],
  };
}

function hierarchyItems(items: (vscode.TypeHierarchyItem | vscode.CallHierarchyItem)[] | undefined) {
  const list = items ?? [];
  return {
    count: list.length,
    sample: list.map((i) => `${i.name} (${kindName(i.kind)}) ${where(i.uri, i.selectionRange.start.line)}`).sort(compare).slice(0, 8),
  };
}

function calls(items: (vscode.CallHierarchyIncomingCall | vscode.CallHierarchyOutgoingCall)[] | undefined) {
  const list = items ?? [];
  return hierarchyItems(list.map((c) => ("from" in c ? c.from : c.to)));
}

/** Flattens DocumentSymbol trees; SymbolInformation lists are already flat. */
function flatten(symbols: (vscode.DocumentSymbol | vscode.SymbolInformation)[]): vscode.DocumentSymbol[] {
  const out: vscode.DocumentSymbol[] = [];
  const walk = (s: vscode.DocumentSymbol | vscode.SymbolInformation) => {
    if ("children" in s) {
      out.push(s);
      s.children.forEach(walk);
    } else {
      const range = s.location.range;
      out.push({ name: s.name, detail: "", kind: s.kind, range, selectionRange: range, children: [], tags: s.tags });
    }
  };
  symbols.forEach(walk);
  return out;
}

async function probeTarget(uri: vscode.Uri, symbol: vscode.DocumentSymbol): Promise<TargetProbe> {
  const at = symbol.selectionRange.start;
  const result: TargetProbe = { name: symbol.name, kind: kindName(symbol.kind), line: at.line + 1, calls: [] };
  const add = (call: Call) => result.calls.push(call);

  add((await timed("out: where it is defined", "vscode.executeDefinitionProvider",
    () => vscode.commands.executeCommand<Located[]>("vscode.executeDefinitionProvider", uri, at), locations)).call);
  add((await timed("down: implementers", "vscode.executeImplementationProvider",
    () => vscode.commands.executeCommand<Located[]>("vscode.executeImplementationProvider", uri, at), locations)).call);
  add((await timed("in: every reference", "vscode.executeReferenceProvider",
    () => vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", uri, at), locations)).call);

  const typeItems = await timed("type hierarchy: prepare", "vscode.prepareTypeHierarchy",
    () => vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>("vscode.prepareTypeHierarchy", uri, at), hierarchyItems);
  add(typeItems.call);
  const typeItem = typeItems.value?.[0];
  if (typeItem) {
    add((await timed("up: supertypes", "vscode.provideSupertypes",
      () => vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>("vscode.provideSupertypes", typeItem), hierarchyItems)).call);
    add((await timed("down: subtypes", "vscode.provideSubtypes",
      () => vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>("vscode.provideSubtypes", typeItem), hierarchyItems)).call);
  }

  const callItems = await timed("call hierarchy: prepare", "vscode.prepareCallHierarchy",
    () => vscode.commands.executeCommand<vscode.CallHierarchyItem[]>("vscode.prepareCallHierarchy", uri, at), hierarchyItems);
  add(callItems.call);
  const callItem = callItems.value?.[0];
  if (callItem) {
    add((await timed("in: callers", "vscode.provideIncomingCalls",
      () => vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>("vscode.provideIncomingCalls", callItem), calls)).call);
    add((await timed("out: callees", "vscode.provideOutgoingCalls",
      () => vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>("vscode.provideOutgoingCalls", callItem), calls)).call);
  }

  add((await timed("find by name across the workspace", "vscode.executeWorkspaceSymbolProvider",
    () => vscode.commands.executeCommand<vscode.SymbolInformation[]>("vscode.executeWorkspaceSymbolProvider", symbol.name),
    (list) => {
      const exact = (list ?? []).filter((s) => s.name === symbol.name);
      return {
        count: exact.length,
        sample: [`${exact.length} exact match(es), ${(list ?? []).length} total`, ...exact.map((s) => `${kindName(s.kind)} ${where(s.location.uri, s.location.range.start.line)}`).sort(compare).slice(0, 5)],
      };
    })).call);

  // Out direction: the types its fields hold. Every field is asked; primitives answer empty.
  const members = symbol.children.filter((c) => MEMBER_KINDS.has(c.kind)).slice(0, MAX_MEMBERS);
  if (members.length) {
    result.member = `${members.length} field(s)`;
    const start = Date.now();
    const found: string[] = [];
    let failed = 0;
    for (const m of members) {
      const { call } = await timed("", "", () =>
        vscode.commands.executeCommand<Located[]>("vscode.executeTypeDefinitionProvider", uri, m.selectionRange.start), locations);
      if (call.status === "answered") {
        found.push(`${m.name} → ${call.sample![1]}`);
      } else if (call.status !== "empty") {
        failed++;
      }
    }
    add({
      purpose: "out: types its fields hold",
      command: "vscode.executeTypeDefinitionProvider",
      status: found.length ? "answered" : failed ? "error" : "empty",
      ms: Date.now() - start,
      count: found.length,
      sample: [`${found.length} of ${members.length} field(s) resolved to a type`, ...found.sort(compare)],
    });
  }
  return result;
}

export async function probeDocument(document: vscode.TextDocument): Promise<ProbeResult> {
  const uri = document.uri;
  const extensions = vscode.extensions.all
    .filter((e) => {
      const pkg = e.packageJSON ?? {};
      const languages: { id?: string }[] = pkg.contributes?.languages ?? [];
      const events: string[] = pkg.activationEvents ?? [];
      return languages.some((l) => l.id === document.languageId) || events.includes(`onLanguage:${document.languageId}`);
    })
    .map((e) => ({ id: e.id, version: String(e.packageJSON?.version ?? "?"), active: e.isActive }))
    .sort((a, b) => compare(a.id, b.id));

  const symbols = await timed("lit boxes: symbols in the file", "vscode.executeDocumentSymbolProvider",
    () => vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>("vscode.executeDocumentSymbolProvider", uri),
    (list) => {
      const flat = flatten(list ?? []);
      return { count: flat.length, sample: (list ?? []).map((s) => `${kindName(s.kind)} ${s.name}`).slice(0, 10) };
    });
  const flat = flatten(symbols.value ?? []);
  const symbolKinds: Record<string, number> = {};
  flat.forEach((s) => (symbolKinds[kindName(s.kind)] = (symbolKinds[kindName(s.kind)] ?? 0) + 1));

  const links = await timed("imports as links", "vscode.executeLinkProvider",
    () => vscode.commands.executeCommand<vscode.DocumentLink[]>("vscode.executeLinkProvider", uri),
    (list) => ({ count: (list ?? []).length, sample: (list ?? []).map((l) => `line ${l.range.start.line + 1} → ${l.target ? where(l.target) : "(resolved on click)"}`).slice(0, 5) }));

  const types = flat.filter((s) => TYPE_KINDS.has(s.kind));
  const targets = (types.length ? types : flat.filter((s) => s.kind === vscode.SymbolKind.Function)).slice(0, MAX_TARGETS);
  const probed: TargetProbe[] = [];
  for (const t of targets) {
    probed.push(await probeTarget(uri, t));
  }

  return {
    file: vscode.workspace.asRelativePath(uri, false),
    languageId: document.languageId,
    vscodeVersion: vscode.version,
    extensions,
    documentSymbols: symbols.call,
    symbolKinds,
    documentLinks: links.call,
    targets: probed,
  };
}

const STATUS = { answered: "✅ answered", empty: "⬜ empty", timeout: "⏱ timeout", error: "❌ error" };

/** Per explorer direction: what the explorer will use for this file. */
export function supportSummary(r: ProbeResult, file: string): string[] {
  const pack = languagePackFor(file);
  const rules = rulesFor(file);
  const calls = r.targets.flatMap((t) => t.calls);
  const answered = (command: string) => calls.some((c) => c.command === command && c.status === "answered");
  const asked = (command: string) => calls.some((c) => c.command === command);
  const symbols = r.documentSymbols.status === "answered";
  const out = [
    "## What the explorer will use",
    "",
    pack
      ? `Language pack: **${pack.label}** (\`${pack.id}\`).`
      : `No language pack lists \`${path.extname(file) || r.languageId}\` files; the generic rules apply, and Explore Classes From Here is not offered for them.`,
    "",
  ];
  if (pack?.source === "analysis") {
    out.push(
      "The explorer answers from its own analysis of this language; the language extension adds every-reference consumers when `classDiagram.explorerConsumers` is `references`.",
      ""
    );
  }
  if (!r.extensions.length) {
    out.push(`**No extension for \`${r.languageId}\` is installed.**${pack?.suggestedExtension ? ` Install one (for example \`${pack.suggestedExtension}\`) and run this check again.` : ""}`, "");
  }
  const line = (direction: string, status: string, how: string) => `| ${direction} | ${status} | ${how} |`;
  const supertypes = answered("vscode.provideSupertypes");
  const hierarchy = asked("vscode.provideSupertypes");
  out.push(
    "| Direction | | How |",
    "|---|---|---|",
    line("Boxes and members", symbols ? "✅" : "❌", symbols ? "document symbols" : "the extension listed no symbols: nothing to explore (run again once it has loaded the project)"),
    line(
      "up: supertypes",
      supertypes ? "✅" : rules.header ? "↪" : "⬜",
      supertypes
        ? "type hierarchy"
        : rules.header
          ? `${hierarchy ? "type hierarchy answered nothing here; " : "no type hierarchy; "}the names in the declaration header (\`${rules.id}\` pack), resolved with go to definition`
          : "none: the language declares no inheritance in headers"
    ),
    line(
      "down: subtypes",
      answered("vscode.provideSubtypes") ? "✅" : answered("vscode.executeImplementationProvider") ? "✅" : rules.header ? "↪" : "⬜",
      answered("vscode.provideSubtypes")
        ? "type hierarchy"
        : answered("vscode.executeImplementationProvider")
          ? "implementations"
          : rules.header
            ? "references that sit in another type's declaration header"
            : "none answered for the probed types"
    ),
    line(
      "out: field types",
      answered("vscode.executeTypeDefinitionProvider") ? "✅" : answered("vscode.executeDefinitionProvider") ? "↪" : "⬜",
      answered("vscode.executeTypeDefinitionProvider")
        ? "go to type definition, else the definitions of the names on the field's line"
        : answered("vscode.executeDefinitionProvider")
          ? "the definitions of the names on each field's declaration line"
          : "none answered for the probed fields"
    ),
    line("in: consumers", answered("vscode.executeReferenceProvider") ? "✅" : "⬜", answered("vscode.executeReferenceProvider") ? "references, each by the innermost type or function around it" : "no references answered"),
    "",
    "✅ the extension answers · ↪ a language pack rule fills in · ⬜ not available for this file",
    ""
  );
  return out;
}

function row(c: Call): string {
  const detail = c.error ?? (c.sample ?? []).join("<br>");
  return `| ${c.purpose} | \`${c.command.replace("vscode.", "")}\` | ${STATUS[c.status]} | ${c.ms} ms | ${detail.replace(/\|/g, "\\|")} |`;
}

export function formatReport(results: ProbeResult[], files: string[] = []): string {
  const out: string[] = ["# Explorer language support", ""];
  out.push(
    "Empty means no extension answered *or* there was nothing to find; VS Code does not tell these apart.",
    "Run the probe a second time after the language extension has finished loading the project: first answers can be partial or slow.",
    ""
  );
  results.forEach((r, i) => {
    out.push(`## ${r.file} (\`${r.languageId}\`)`, "", `VS Code ${r.vscodeVersion}. Extensions for this language:`, "");
    out.push(...(r.extensions.length ? r.extensions.map((e) => `- \`${e.id}\` ${e.version}${e.active ? "" : " (not active)"}`) : ["- none found"]), "");
    out.push(...supportSummary(r, files[i] ?? r.file).map((l) => l.replace(/^## /, "### ")));
    out.push("### Details (for language pack authors)", "");
    out.push("| Explorer use | Command | Result | Time | Answer |", "|---|---|---|---|---|", row(r.documentSymbols), row(r.documentLinks), "");
    const kinds = Object.entries(r.symbolKinds).sort((a, b) => compare(a[0], b[0]));
    out.push(`Symbol kinds: ${kinds.length ? kinds.map(([k, n]) => `${k} ${n}`).join(", ") : "none"}`, "");
    if (!r.targets.length) {
      out.push("No class, interface, struct, enum or function symbols to probe further.", "");
    }
    for (const t of r.targets) {
      out.push(`#### ${t.kind} \`${t.name}\` (line ${t.line})${t.member ? `, ${t.member}` : ""}`, "");
      out.push("| Explorer use | Command | Result | Time | Answer |", "|---|---|---|---|---|", ...t.calls.map(row), "");
    }
  });
  return out.join("\n");
}

/** Command entry: checks the given file, else the active editor's. */
export async function runProbe(uri?: vscode.Uri): Promise<string | undefined> {
  const target = uri ?? vscode.window.activeTextEditor?.document.uri;
  if (!target) {
    vscode.window.showInformationMessage("Open a source file first, then check its language support.");
    return undefined;
  }
  const document = await vscode.workspace.openTextDocument(target);
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Asking the language extension about ${path.basename(target.fsPath)}` },
    () => probeDocument(document)
  );
  const report = formatReport([result], [target.fsPath]);
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report });
  await vscode.window.showTextDocument(doc, { preview: false });
  return report;
}
