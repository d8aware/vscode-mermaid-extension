/**
 * Providers backed by VS Code's built-in provider commands, i.e. by whatever
 * language extension is installed for the file's language.
 */
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Loc, Pos, Providers, Span, Sym } from "./ProviderGraph";

type Located = vscode.Location | vscode.LocationLink;

const span = (r: vscode.Range): Span => ({
  start: { line: r.start.line, character: r.start.character },
  end: { line: r.end.line, character: r.end.character },
});
const position = (p: Pos) => new vscode.Position(p.line, p.character);
const uri = (file: string) => vscode.Uri.file(file);

function toLoc(l: Located): Loc {
  return "targetUri" in l
    ? { file: l.targetUri.fsPath, range: span(l.targetSelectionRange ?? l.targetRange) }
    : { file: l.uri.fsPath, range: span(l.range) };
}

function toSym(s: vscode.DocumentSymbol | vscode.SymbolInformation): Sym {
  if ("children" in s) {
    return {
      name: s.name,
      kind: vscode.SymbolKind[s.kind],
      detail: s.detail || undefined,
      range: span(s.range),
      selectionRange: span(s.selectionRange),
      children: s.children.map(toSym),
    };
  }
  const range = span(s.location.range);
  return { name: s.name, kind: vscode.SymbolKind[s.kind], range, selectionRange: range, children: [] };
}

const list = <T>(value: T | T[] | undefined | null): T[] => (!value ? [] : Array.isArray(value) ? value : [value]);

export function vscodeProviders(): Providers {
  const hierarchy = async (file: string, at: Pos, command: "vscode.provideSupertypes" | "vscode.provideSubtypes") => {
    const items = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>("vscode.prepareTypeHierarchy", uri(file), position(at));
    if (!items?.length) {
      return undefined; // no type hierarchy for this language (or nothing at this position)
    }
    const answers = await vscode.commands.executeCommand<vscode.TypeHierarchyItem[]>(command, items[0]);
    return list(answers).map((i) => ({ file: i.uri.fsPath, range: span(i.selectionRange) }));
  };
  return {
    async documentSymbols(file) {
      const symbols = await vscode.commands.executeCommand<(vscode.DocumentSymbol | vscode.SymbolInformation)[]>(
        "vscode.executeDocumentSymbolProvider",
        uri(file)
      );
      return list(symbols).map(toSym);
    },
    supertypes: (file, at) => hierarchy(file, at, "vscode.provideSupertypes"),
    subtypes: (file, at) => hierarchy(file, at, "vscode.provideSubtypes"),
    async implementations(file, at) {
      return list(await vscode.commands.executeCommand<Located[]>("vscode.executeImplementationProvider", uri(file), position(at))).map(toLoc);
    },
    async definition(file, at) {
      return list(await vscode.commands.executeCommand<Located[]>("vscode.executeDefinitionProvider", uri(file), position(at))).map(toLoc);
    },
    async text(file) {
      return fs.promises.readFile(file, "utf8");
    },
    async typeDefinition(file, at) {
      return list(await vscode.commands.executeCommand<Located[]>("vscode.executeTypeDefinitionProvider", uri(file), position(at))).map(toLoc);
    },
    async references(file, at) {
      return list(await vscode.commands.executeCommand<vscode.Location[]>("vscode.executeReferenceProvider", uri(file), position(at))).map(toLoc);
    },
    async siblings(file) {
      const dir = path.dirname(file);
      try {
        return (await fs.promises.readdir(dir, { withFileTypes: true })).filter((e) => e.isFile()).map((e) => path.join(dir, e.name));
      } catch {
        return [file];
      }
    },
  };
}

/** The installed extensions that contribute or activate on a language, as "id version". */
export function languageExtensions(languageId: string): string[] {
  return vscode.extensions.all
    .filter((e) => {
      const pkg = e.packageJSON ?? {};
      const languages: { id?: string }[] = pkg.contributes?.languages ?? [];
      const events: string[] = pkg.activationEvents ?? [];
      return events.includes(`onLanguage:${languageId}`) || (languages.some((l) => l.id === languageId) && !e.id.startsWith("vscode."));
    })
    .map((e) => `${e.id} ${e.packageJSON?.version ?? ""}`.trim())
    .sort();
}
