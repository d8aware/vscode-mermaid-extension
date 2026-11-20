/**
 * Dev command: records the installed language extension's answers for an
 * explorer example (`test-files/explorer/<name>.views/views.json`), so the
 * ProviderGraph goldens can replay them without the extension. The same
 * format as scripts/record-provider-answers.js (which talks to gopls
 * directly); this one goes through VS Code, so it works for any language.
 */
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { Loc, Pos, ProviderGraph, Providers } from "../classDiagram/ProviderGraph";
import { vscodeProviders } from "../classDiagram/vscodeProviders";

const READY_ATTEMPTS = 120;

export async function recordAnswers(viewsJson?: vscode.Uri, options: { quiet?: boolean } = {}): Promise<string | undefined> {
  const target =
    viewsJson ??
    (
      await vscode.window.showOpenDialog({
        title: "Pick an explorer example's views.json",
        filters: { "views.json": ["json"] },
        canSelectMany: false,
      })
    )?.[0];
  if (!target) {
    return undefined;
  }
  const viewsDir = path.dirname(target.fsPath);
  const config = JSON.parse(fs.readFileSync(target.fsPath, "utf8"));
  const root = path.resolve(viewsDir, config.example);
  const live = vscodeProviders();
  const answers: Record<string, unknown> = {};

  const rel = (file: string) => path.relative(root, file).split(path.sep).join("/");
  const at = (file: string, pos: Pos) => `${rel(file)}:${pos.line}:${pos.character}`;
  // Inside the example: relative. Outside (standard libraries): as they are.
  // Files outside the example (standard libraries) keep only their last folder and name:
  // recordings are committed, and the full path would name the recording machine and user.
  const external = (file: string) => "/external/" + file.split(/[\\/]/).slice(-2).join("/");
  const relLocs = (locs: Loc[] | undefined) => locs?.map((l) => ({ ...l, file: l.file.startsWith(root + path.sep) ? rel(l.file) : external(l.file) }));
  const record = async <T>(key: string, run: () => Promise<T>, store: (value: T) => unknown = (v) => v): Promise<T> => {
    try {
      const value = await run();
      answers[key] = value === undefined ? { undefined: true } : store(value);
      return value;
    } catch (error) {
      answers[key] = { error: error instanceof Error ? error.message : String(error) };
      throw error;
    }
  };
  const providers: Providers = {
    documentSymbols: (file) => record(`documentSymbols ${rel(file)}`, () => live.documentSymbols(file)),
    supertypes: (file, pos) => record(`supertypes ${at(file, pos)}`, () => live.supertypes(file, pos), relLocs),
    subtypes: (file, pos) => record(`subtypes ${at(file, pos)}`, () => live.subtypes(file, pos), relLocs),
    implementations: (file, pos) => record(`implementations ${at(file, pos)}`, () => live.implementations(file, pos), relLocs),
    definition: (file, pos) => record(`definition ${at(file, pos)}`, () => live.definition(file, pos), relLocs),
    typeDefinition: (file, pos) => record(`typeDefinition ${at(file, pos)}`, () => live.typeDefinition(file, pos), relLocs),
    references: (file, pos) => record(`references ${at(file, pos)}`, () => live.references(file, pos), relLocs),
    siblings: (file) => record(`siblings ${rel(path.dirname(file)) || "."}`, () => live.siblings(file), (files) => files.map(rel).sort()),
    text: (file) => live.text(file),
  };

  const walks = Object.entries<{ start: string; light: string[] }>(config.views);
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Recording answers for ${path.basename(root)}`, cancellable: true },
    async (progress, token) => {
      // Wait until the language extension answers for the first start file.
      const first = path.join(root, walks[0][1].start);
      await vscode.workspace.openTextDocument(first);
      for (let i = 0; i < READY_ATTEMPTS && !token.isCancellationRequested; i++) {
        progress.report({ message: "waiting for the language extension…" });
        if ((await live.documentSymbols(first)).length) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const log: string[] = [];
      for (const [name, walk] of walks) {
        if (token.isCancellationRequested) {
          return undefined;
        }
        progress.report({ message: name });
        const graph = new ProviderGraph(providers, { root, inWorkspace: (f) => f.startsWith(root + path.sep), includeTestFiles: false });
        const origin = await graph.start(path.join(root, walk.start));
        for (const id of [...origin, ...walk.light]) {
          await graph.expand(id);
        }
        const missing = walk.light.filter((id) => !graph.has(id));
        log.push(`${name}: ${origin.join(", ") || "(nothing)"} + ${walk.light.join(", ") || "(none)"}${missing.length ? ` — NOT REACHED: ${missing.join(", ")}` : ""}`);
      }
      const sorted = Object.fromEntries(Object.keys(answers).sort().map((k) => [k, answers[k]]));
      const out = path.join(viewsDir, config.answers);
      fs.writeFileSync(out, JSON.stringify(sorted, null, 1) + "\n");
      const summary = `${Object.keys(sorted).length} answers recorded to ${out}\n${log.join("\n")}`;
      if (!options.quiet) {
        vscode.window.showInformationMessage(summary, { modal: true });
      }
      return summary;
    }
  );
}
