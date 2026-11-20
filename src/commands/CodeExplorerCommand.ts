import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { analyze, GenerationCancelledError, loadFolder } from "../classDiagram/ClassDiagramGenerator";
import { ClassGraph, DIRECTION_LABELS, ExplorerGraph, ExplorerView, renderExplorerView } from "../classDiagram/ClassExplorer";
import { ProviderGraph } from "../classDiagram/ProviderGraph";
import { WithReferenceConsumers } from "../classDiagram/ReferenceConsumers";
import { languageExtensions, vscodeProviders } from "../classDiagram/vscodeProviders";
import { LandscapeModel, LandscapeProject, ScanCancelledError, scanFolder } from "../landscape/scan";
import { LandscapeView, renderLandscapeView } from "../landscape/view";
import { ProjectCode, ProjectView, readProjectCode, renderProjectView, shownFolder } from "../landscape/project";
import { DECLARATION_FILE, IGNORED_FOLDERS, MARKER_RULES } from "../landscape/rules";
import { languagePackFor } from "../packs";
import { projectRootFor } from "./GenerateClassDiagramCommand";
import { diagramWebviewHtml } from "./webviewContent";

/** One place in the explorer: a landscape level, a folder of one project's code, or classes lit around a file. */
type Step =
  | { kind: "landscape"; model: LandscapeModel; container: string }
  | { kind: "project"; model: LandscapeModel; code: ProjectCode; folder: string }
  | { kind: "classes"; file: string; graph: ExplorerGraph; origin: string[]; lit: string[]; notes?: string[] };

interface Session {
  /** Visited steps; the last one is shown. Back pops. */
  steps: Step[];
  /** Landscape the session started from (or reached), for breadcrumbs. */
  landscape?: LandscapeModel;
  view?: LandscapeView | ProjectView | ExplorerView;
}

/**
 * How the shown step relates to the one shown before, so the panel can keep
 * the viewer oriented: the same scene grown ("extend": boxes glide to their
 * new places), a level deeper or higher (zoom in or out), or elsewhere. `focus`
 * is the box just brought in; `from` the box where the viewer was before.
 */
export interface Transition {
  kind: "start" | "extend" | "descend" | "ascend" | "jump";
  /** "Projects", "Code" or "Classes": shown as a badge that flashes when it changes. */
  level: string;
  focus?: string;
  from?: string;
}

interface Crumb {
  label: string;
  /** A landscape level (or, for a project with none inside, its project view). */
  container?: string;
  /** A folder of the current project's view. */
  folder?: string;
}

const samePath = (a: string, b: string) => path.resolve(a) === path.resolve(b);
const within = (p: string, dir: string) => p.startsWith(dir + path.sep);
/** Files with a language pack (src/packs) can be explored. */
const isExplorable = (file: string) => !!languagePackFor(file);
const READY_ATTEMPTS = 40;
/** The explorer opens in the main editor area; files opened from it open beside it, so the map stays in view. */
const SOURCE_COLUMN = vscode.ViewColumn.Beside;
const READY_INTERVAL_MS = 500;

/** Said when a file declares no types and the view starts from what it re-exports. */
function reexportNote(file: string, origin: string[], graph: ExplorerGraph): string[] {
  const elsewhere = origin.length > 0 && origin.every((id) => !samePath(graph.location(id)?.file ?? file, file));
  return elsewhere ? [`${path.basename(file)} declares no types: showing the ${origin.length} it re-exports`] : [];
}

/**
 * The Code Explorer panel: "Explore From Here" on a folder (a landscape of the
 * projects in it, see src/landscape) and "Explore Classes From Here" on a
 * TypeScript file (classes that grow as you click, see ClassExplorer). Both
 * share one panel and one history, so Back, Start over and the breadcrumb
 * work across them.
 */
export class CodeExplorerCommand {
  private static panel: vscode.WebviewPanel | undefined;
  private static ready: Promise<void> | undefined;
  private static session: Session | undefined;
  /** The step shown last, to tell how the next one relates to it. */
  private static shown: Step | undefined;
  /** Cached per root folder for the session; dropped when a file under it is saved. */
  private static graphs = new Map<string, Promise<ExplorerGraph>>();
  private static landscapes = new Map<string, Promise<LandscapeModel>>();
  /** Project code, per project folder. */
  private static codes = new Map<string, Promise<ProjectCode>>();

  static register(context: vscode.ExtensionContext): vscode.Disposable[] {
    const target = (uri?: vscode.Uri) => uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
    return [
      vscode.commands.registerCommand("vscode-mermaid-extension.exploreClasses", (uri?: vscode.Uri) => {
        const file = target(uri);
        if (!file) {
          vscode.window.showInformationMessage("Open or select a source file first.");
          return;
        }
        return this.exploreClasses(context, file);
      }),
      vscode.commands.registerCommand("vscode-mermaid-extension.exploreFolder", (uri?: vscode.Uri) => {
        const folder = uri?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!folder) {
          vscode.window.showInformationMessage("Open a folder first.");
          return;
        }
        return this.exploreFolder(context, folder);
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        const saved = path.resolve(document.fileName);
        for (const cache of [this.landscapes, this.graphs, this.codes] as Map<string, unknown>[]) {
          for (const root of [...cache.keys()]) {
            if (within(saved, path.resolve(root))) {
              cache.delete(root);
            }
          }
        }
      }),
    ];
  }

  /** "Explore From Here" on a folder. */
  static async exploreFolder(context: vscode.ExtensionContext, folder: string) {
    const panel = await this.openPanel(context, folder);
    let model: LandscapeModel;
    try {
      model = await this.landscapeFor(path.resolve(folder), panel);
    } catch (error) {
      return this.reportFailure(error);
    }
    if (panel !== this.panel) {
      return;
    }
    this.session = { steps: [{ kind: "landscape", model, container: model.root }], landscape: model };
    this.render();
  }

  /** "Explore Classes From Here" on a TypeScript or Go file. */
  static async exploreClasses(context: vscode.ExtensionContext, file: string) {
    const panel = await this.openPanel(context, file);
    const step = await this.classStep(file, panel);
    if (step && panel === this.panel) {
      this.session = { steps: [step] };
      this.render();
    }
  }

  // -------------------------------------------------------------------------
  // Data

  private static landscapeFor(root: string, panel: vscode.WebviewPanel): Promise<LandscapeModel> {
    const cached = this.landscapes.get(root);
    if (cached) {
      return cached;
    }
    const label = `Scanning ${path.basename(root)}…`;
    const post = (done: number, total: number, file?: string, detail?: string) =>
      panel.webview.postMessage({ command: "analysisProgress", label, done, total, file, detail });
    post(0, 0);
    let last = 0;
    const work = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50)); // let the loading scene paint
      return scanFolder(root, {
        isCancelled: () => panel !== this.panel,
        onProgress: (phase, done, total, file) => {
          const now = Date.now();
          if (now - last > 80 || done === total) {
            last = now;
            if (phase === "files") {
              post(0, 0, undefined, `${done.toLocaleString("en-US")} files found`);
            } else {
              post(done, total, file);
            }
          }
        },
      });
    })();
    this.landscapes.set(root, work);
    work.catch(() => this.landscapes.delete(root));
    return work;
  }

  private static graphFor(root: string, file: string, panel: vscode.WebviewPanel): Promise<ExplorerGraph> {
    const cached = this.graphs.get(root);
    if (cached) {
      return cached;
    }
    const label = `Mapping classes in ${path.basename(root)}…`;
    panel.webview.postMessage({ command: "analysisProgress", label, done: 0, total: 0 });
    let last = 0;
    const work = (async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const includeTestFiles = vscode.workspace
        .getConfiguration("vscode-mermaid-extension")
        .get<boolean>("classDiagram.includeTestFiles", false);
      const { sourceFiles } = loadFolder(root, { includeTestFiles, alwaysInclude: [file] });
      const model = await analyze(sourceFiles, {
        isCancelled: () => panel !== this.panel,
        onProgress: (done, total, name) => {
          const now = Date.now();
          if (now - last > 80 || done === total) {
            last = now;
            panel.webview.postMessage({ command: "analysisProgress", label, done, total, file: name });
          }
        },
      });
      return new ClassGraph(model, root);
    })();
    this.graphs.set(root, work);
    work.catch(() => this.graphs.delete(root));
    return work;
  }

  /** A project step at the project's start folder (its single source root, else its folder). */
  private static async projectStep(model: LandscapeModel, project: LandscapeProject): Promise<Step | undefined> {
    const panel = this.panel;
    if (!panel) {
      return undefined;
    }
    let work = this.codes.get(project.dir);
    if (!work) {
      const label = `Reading ${path.basename(project.dir)}…`;
      let last = 0;
      const includeTestFiles = vscode.workspace
        .getConfiguration("vscode-mermaid-extension")
        .get<boolean>("classDiagram.includeTestFiles", false);
      work = readProjectCode(model, project, {
        includeTestFiles,
        isCancelled: () => panel !== this.panel,
        onProgress: (done, total, file) => {
          const now = Date.now();
          if (now - last > 80 || done === total) {
            last = now;
            panel.webview.postMessage({ command: "analysisProgress", label, done, total, file });
          }
        },
      });
      this.codes.set(project.dir, work);
      work.catch(() => this.codes.delete(project.dir));
    }
    try {
      const code = await work;
      return { kind: "project", model, code, folder: shownFolder(code, code.start) };
    } catch (error) {
      this.reportFailure(error);
      return undefined;
    }
  }

  /** Opens a project the way clicking its box does: projects inside it show as a landscape, else its code. */
  private static async openProject(model: LandscapeModel, project: LandscapeProject) {
    if (model.projects.some((p) => p !== project && within(p.dir, project.dir))) {
      return this.push({ kind: "landscape", model, container: project.dir });
    }
    const step = await this.projectStep(model, project);
    return step ? this.push(step) : this.settle();
  }

  /** A classes step starting from `file`, or undefined (reported) if there is nothing to show. */
  private static async classStep(file: string, panel: vscode.WebviewPanel): Promise<Step | undefined> {
    if (languagePackFor(file)?.source === "language-extension") {
      return this.providerStep(file, panel);
    }
    let graph: ExplorerGraph;
    try {
      graph = await this.graphFor(projectRootFor(file), file, panel);
    } catch (error) {
      this.reportFailure(error);
      return undefined;
    }
    let origin = (graph as ClassGraph).idsInFile(file, samePath);
    const notes: string[] = [];
    if (origin.length === 0) {
      // A barrel (public-api.ts, index.ts) declares nothing itself: start from what it re-exports.
      origin = (graph as ClassGraph).idsReexportedBy(file, samePath);
      notes.push(...reexportNote(file, origin, graph));
    }
    if (origin.length === 0) {
      vscode.window.showInformationMessage(
        `No TypeScript classes, interfaces, enums or object types found in ${path.basename(file)}.`
      );
      this.settle();
      return undefined;
    }
    const consumers = vscode.workspace
      .getConfiguration("vscode-mermaid-extension")
      .get<"declared" | "references">("classDiagram.explorerConsumers", "declared");
    if (consumers === "references") {
      // Phase 3: "in" from every reference, asked of the TypeScript extension per lit class.
      const root = projectRootFor(file);
      graph = new WithReferenceConsumers(graph as ClassGraph, vscodeProviders(), (f) => inWorkspace(f, root));
      panel.webview.postMessage({ command: "analysisProgress", label: "Asking the TypeScript extension for references…", done: 0, total: 0 });
      try {
        await Promise.all(origin.map((id) => graph.expand(id)));
      } catch (error) {
        this.reportFailure(error);
        return undefined;
      }
    }
    return { kind: "classes", file, graph, origin, lit: [...origin], notes };
  }

  /**
   * A classes step answered by the installed language extension (Go: gopls via
   * golang.go). Waits for the extension to answer for the start file first.
   */
  private static async providerStep(file: string, panel: vscode.WebviewPanel): Promise<Step | undefined> {
    const document = await vscode.workspace.openTextDocument(file);
    const extensions = languageExtensions(document.languageId);
    const source = extensions.join(", ") || `the ${document.languageId} language extension`;
    const providers = vscodeProviders();
    const post = (label: string, detail?: string) =>
      panel.webview.postMessage({ command: "analysisProgress", label, done: 0, total: 0, detail });

    // Ready when the extension reports the file's symbols, or (a barrel with none) resolves its first re-export.
    const firstReexport = languagePackFor(file)?.reexports?.(document.getText(), file)[0];
    let answered = false;
    for (let attempt = 0; attempt < READY_ATTEMPTS && panel === this.panel; attempt++) {
      post(`Waiting for ${source}…`, attempt ? "The language server is loading the project" : undefined);
      if ((await providers.documentSymbols(file)).length || (firstReexport && (await providers.definition(file, firstReexport)).length)) {
        answered = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, READY_INTERVAL_MS));
    }
    if (panel !== this.panel) {
      return undefined;
    }
    if (!answered) {
      vscode.window.showInformationMessage(
        extensions.length
          ? `${source} found no types in ${path.basename(file)}.`
          : `No language extension answered for ${path.basename(file)}. Install one for ${document.languageId}${
              languagePackFor(file)?.suggestedExtension ? ` (e.g. ${languagePackFor(file)!.suggestedExtension})` : ""
            }.`
      );
      this.settle();
      return undefined;
    }

    const root = explorerRoot(file);
    const key = `providers:${root}`;
    let cached = this.graphs.get(key) as Promise<ProviderGraph> | undefined;
    if (!cached) {
      const includeTestFiles = vscode.workspace
        .getConfiguration("vscode-mermaid-extension")
        .get<boolean>("classDiagram.includeTestFiles", false);
      cached = Promise.resolve(new ProviderGraph(providers, { root, inWorkspace: (f) => inWorkspace(f, root), includeTestFiles, source }));
      this.graphs.set(key, cached);
    }
    const graph = await cached;
    try {
      post(`Asking ${source}…`, path.basename(file));
      const origin = await graph.start(file);
      if (origin.length === 0) {
        vscode.window.showInformationMessage(`No types or functions found in ${path.basename(file)}.`);
        this.settle();
        return undefined;
      }
      await Promise.all(origin.map((id) => graph.expand(id)));
      return { kind: "classes", file, graph, origin, lit: [...origin], notes: reexportNote(file, origin, graph) };
    } catch (error) {
      this.reportFailure(error);
      return undefined;
    }
  }

  private static reportFailure(error: unknown) {
    if (!(error instanceof GenerationCancelledError) && !(error instanceof ScanCancelledError)) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Exploring failed: ${message}`);
    }
    this.settle();
  }

  // -------------------------------------------------------------------------
  // Rendering

  private static current(): Step | undefined {
    return this.session?.steps[this.session.steps.length - 1];
  }

  private static render() {
    const session = this.session;
    const step = this.current();
    if (!session || !step || !this.panel) {
      return;
    }
    let content: string;
    let tooltips: Record<string, string> = {};
    if (step.kind === "landscape") {
      const view = renderLandscapeView(step.model, step.container);
      session.view = view;
      content = view.mermaid;
      tooltips = Object.fromEntries(view.tooltips);
      this.panel.title = `Explore · ${path.basename(step.container)}`;
    } else if (step.kind === "project") {
      const view = renderProjectView(step.code, step.folder);
      step.folder = view.folder; // folders holding one folder and no files pass through
      session.view = view;
      content = view.mermaid;
      tooltips = Object.fromEntries(view.tooltips);
      this.panel.title = `Explore · ${path.basename(view.folder)}`;
    } else {
      const view = renderExplorerView(step.graph, step);
      session.view = view;
      content = view.mermaid;
      for (const id of [...step.lit, ...view.frontier]) {
        const text = step.graph.tooltip?.(id);
        if (text) {
          tooltips[id] = text;
        }
      }
      this.panel.title = `Explore · ${path.basename(step.file)}`;
    }
    const transition = this.transition(this.shown, step, session.view!);
    this.shown = step;
    this.panel.webview.postMessage({
      command: "renderContent",
      content,
      tooltips,
      transition,
      crumbs: this.crumbs(step).map((c) => c.label),
      notes: step.kind === "classes" ? [...(step.notes ?? []), ...(step.graph.notes?.() ?? [])] : [],
      canGoBack: session.steps.length > 1,
    });
  }

  /** Where a step is: a folder (landscape, project) or a file (classes). */
  private static locationOf(step: Step): string {
    return step.kind === "landscape" ? step.container : step.kind === "project" ? step.folder : step.file;
  }

  /** How deep a step is: landscape levels by folder depth, then project folders, then classes. */
  private static depthOf(step: Step): number {
    const segments = (p: string) => path.resolve(p).split(path.sep).length;
    return step.kind === "landscape" ? segments(step.container) : step.kind === "project" ? 1000 + segments(step.folder) : 100000;
  }

  static transition(previous: Step | undefined, step: Step, view: LandscapeView | ProjectView | ExplorerView): Transition {
    const level = step.kind === "landscape" ? "Projects" : step.kind === "project" ? "Code" : "Classes";
    if (!previous || previous === step) {
      return { kind: "start", level };
    }
    if (previous.kind === "classes" && step.kind === "classes" && previous.graph === step.graph) {
      // The same scene, grown or shrunk by one class: the newest lit class is the focus, the previous one where we came from.
      const last = (s: typeof step) => (s.lit.length > s.origin.length ? s.lit[s.lit.length - 1] : undefined);
      const focus = last(step);
      const from = last(previous);
      return { kind: "extend", level, focus, from: from !== focus ? from : undefined };
    }
    const deeper = this.depthOf(step) - this.depthOf(previous);
    if (deeper > 0) {
      return { kind: "descend", level };
    }
    // Higher or elsewhere: the box that holds where we were.
    const was = path.resolve(this.locationOf(previous));
    const holds = (p: string) => was === path.resolve(p) || within(was, path.resolve(p));
    let from: string | undefined;
    let best = -1;
    for (const [id, target] of (view as { nodes?: Map<string, any> }).nodes ?? []) {
      const p: string | undefined = target.project?.dir ?? target.dir ?? target.file;
      if (p && holds(p) && p.length > best) {
        from = id;
        best = p.length;
      }
    }
    return { kind: deeper < 0 ? "ascend" : "jump", level, from };
  }

  /** Where the current step is: the landscape levels above it, then the file. */
  private static crumbs(step: Step): Crumb[] {
    const landscape = this.session?.landscape;
    const levels = (dir: string): Crumb[] => {
      if (!landscape || !(dir === landscape.root || within(dir, landscape.root))) {
        return [];
      }
      const chain = landscape.projects
        .filter((p) => p.dir !== landscape.root && (p.dir === dir || within(dir, p.dir)))
        .sort((a, b) => a.dir.length - b.dir.length);
      return [
        { label: path.basename(landscape.root), container: landscape.root },
        ...chain.map((p) => ({ label: path.basename(p.dir), container: p.dir })),
      ];
    };
    if (step.kind === "landscape") {
      return levels(step.container);
    }
    if (step.kind === "project") {
      const { project } = step.code;
      const top = shownFolder(step.code, step.code.start);
      const base = step.folder === top || within(step.folder, top) ? top : project.dir;
      const folders: Crumb[] = [];
      for (let dir = step.folder; dir !== base && within(dir, base); dir = path.dirname(dir)) {
        folders.unshift({ label: path.basename(dir), folder: dir });
      }
      const above = levels(project.dir).slice(0, -1);
      return [...above, { label: path.basename(project.dir), folder: base }, ...folders];
    }
    const owner = landscape?.files.find((f) => samePath(f.path, step.file))?.owner;
    const above = owner ? levels(owner.dir) : [];
    return [...above, { label: path.basename(step.file) }];
  }

  private static settle() {
    this.panel?.webview.postMessage({ command: "explorerSettle", canGoBack: (this.session?.steps.length ?? 0) > 1 });
  }

  private static push(step: Step) {
    this.session!.steps.push(step);
    this.render();
  }

  // -------------------------------------------------------------------------
  // Interaction

  private static async onMessage(message: { command: string; id?: string; index?: number }) {
    const session = this.session;
    const step = this.current();
    if (!session || !step) {
      return this.settle();
    }
    switch (message.command) {
      case "nodeClick":
        return step.kind === "landscape"
          ? this.onLandscapeClick(step, message.id!)
          : step.kind === "project"
            ? this.onProjectClick(step, message.id!)
            : this.onClassClick(step, message.id!);
      case "back":
        if (session.steps.length > 1) {
          session.steps.pop();
          return this.render();
        }
        return this.settle();
      case "reset": {
        const first = session.steps[0];
        if (step === first || JSON.stringify(this.key(step)) === JSON.stringify(this.key(first))) {
          return this.settle();
        }
        return this.push(first.kind === "classes" ? { ...first, lit: [...first.origin] } : { ...first });
      }
      case "crumb": {
        const crumb = this.crumbs(step)[message.index ?? -1];
        if (crumb?.folder && step.kind === "project" && crumb.folder !== step.folder) {
          return this.push({ ...step, folder: crumb.folder });
        }
        if (crumb?.container && session.landscape && !(step.kind === "landscape" && step.container === crumb.container)) {
          const project = session.landscape.projects.find((p) => p.dir === crumb.container);
          return project && crumb.container !== session.landscape.root
            ? this.openProject(session.landscape, project)
            : this.push({ kind: "landscape", model: session.landscape, container: crumb.container });
        }
        return this.settle();
      }
      case "save":
        return this.save(step);
      default:
        return this.settle();
    }
  }

  private static key(step: Step) {
    return step.kind === "landscape" ? [step.container] : step.kind === "project" ? [step.code.project.dir, step.folder] : [step.file, ...step.lit];
  }

  private static async onLandscapeClick(step: Extract<Step, { kind: "landscape" }>, id: string) {
    const view = this.session!.view as LandscapeView;
    const target = view.nodes.get(id);
    if (!target) {
      return this.settle();
    }
    if (target.type === "external") {
      // Go to the level where that project is visible.
      return this.push({ ...step, container: target.project.parent?.dir ?? step.model.root });
    }
    const containerProject = step.model.projects.find((p) => p.dir === step.container);
    if (target.type === "folders" && containerProject) {
      // A project's own files: its code view.
      const next = await this.projectStep(step.model, containerProject);
      return next ? this.push(next) : this.settle();
    }
    if (target.type === "folders") {
      const picked = await vscode.window.showQuickPick(
        target.folders.map((dir) => ({ label: path.basename(dir) + "/", description: path.relative(step.model.root, dir), dir })),
        { title: "Folders with no project marker", placeHolder: "Reveal a folder in the Explorer" }
      );
      if (picked) {
        await vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(picked.dir));
      }
      return this.settle();
    }
    return this.openProject(step.model, target.project);
  }

  private static async onProjectClick(step: Extract<Step, { kind: "project" }>, id: string) {
    const view = this.session!.view as ProjectView;
    const target = view.nodes.get(id);
    if (!target) {
      return this.settle();
    }
    switch (target.type) {
      case "folder":
        return this.push({ ...step, folder: target.dir });
      case "file":
        return this.exploreOrOpen(target.file);
      case "files": {
        const picked = await vscode.window.showQuickPick(
          target.files.map((file) => ({ label: path.basename(file), description: path.relative(step.code.project.dir, path.dirname(file)), file })),
          { title: `${target.files.length} files in ${path.basename(view.folder)}`, placeHolder: "Pick a file", matchOnDescription: true }
        );
        return picked ? this.exploreOrOpen(picked.file) : this.settle();
      }
      case "project":
        return this.openProject(step.model, target.project);
      case "project-files":
        return this.projectActions(step, target.project);
    }
  }

  /** Explores a file's classes when a language pack reads it; otherwise (or with none found) opens it. */
  private static async exploreOrOpen(file: string) {
    if (isExplorable(file) && !DECLARATION_FILE.test(file) && this.panel) {
      const step = await this.classStep(file, this.panel);
      if (step) {
        return this.push(step);
      }
    }
    await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: SOURCE_COLUMN, preview: true });
    this.settle();
  }

  /** The project-files box: open a marker file, the project folder's view, or reveal it. */
  private static async projectActions(step: Extract<Step, { kind: "project" }>, project: LandscapeProject) {
    type Action = vscode.QuickPickItem & { run: () => unknown };
    const actions: Action[] = [
      ...(step.folder !== project.dir
        ? [{ label: "$(folder) Show the project folder", description: project.rel, run: () => this.push({ ...step, folder: project.dir }) }]
        : []),
      ...project.markers.map((m) => ({
        label: `$(go-to-file) Open ${m.file}`,
        run: () => vscode.window.showTextDocument(vscode.Uri.file(path.join(project.dir, m.file)), { viewColumn: SOURCE_COLUMN }),
      })),
      {
        label: "$(folder-opened) Reveal in Explorer",
        run: () => vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(project.dir)),
      },
    ];
    const picked = await vscode.window.showQuickPick(actions, { title: `${project.kind}: ${project.rel}` });
    await picked?.run();
    if (!picked?.label.includes("project folder")) {
      this.settle();
    }
  }

  private static async onClassClick(step: Extract<Step, { kind: "classes" }>, id: string) {
    const view = this.session!.view as ExplorerView;
    const { graph } = step;
    const overflow = view.overflow.get(id);
    if (overflow) {
      const picked = await vscode.window.showQuickPick(
        overflow.ids.map((other) => ({ label: graph.name(other), description: graph.folder(other), id: other })),
        {
          title: `${overflow.ids.length} more ${DIRECTION_LABELS[overflow.direction]} of ${graph.name(overflow.of)}`,
          placeHolder: "Pick a class to explore",
          matchOnDescription: true,
        }
      );
      return picked ? this.light(step, picked.id) : this.settle();
    }
    if (step.lit.includes(id)) {
      this.settle();
      return this.openSource(step, id);
    }
    if (graph.has(id)) {
      return this.light(step, id);
    }
    vscode.window.showInformationMessage(`${graph.name(id)} is defined outside this project.`);
    return this.settle();
  }

  /** Lights up a class: loads what is one step away from it, then shows it. */
  private static async light(step: Extract<Step, { kind: "classes" }>, id: string) {
    try {
      await step.graph.expand(id);
    } catch (error) {
      return this.reportFailure(error);
    }
    if (this.current() === step) {
      this.push({ ...step, lit: [...step.lit, id] });
    }
  }

  private static async openSource(step: Extract<Step, { kind: "classes" }>, id: string) {
    const location = step.graph.location(id);
    if (!location) {
      return;
    }
    const line = location.line - 1;
    await vscode.window.showTextDocument(vscode.Uri.file(location.file), {
      viewColumn: SOURCE_COLUMN,
      selection: new vscode.Range(line, 0, line, 0),
    });
  }

  private static async save(step: Step) {
    const view = this.session?.view;
    const defaultPath =
      step.kind === "landscape"
        ? path.join(step.container, `${path.basename(step.container)}.landscape.mmd`)
        : step.kind === "project"
          ? path.join(step.folder, `${path.basename(step.folder)}.project.mmd`)
        : path.join(path.dirname(step.file), `${path.basename(step.file).replace(/\.[^.]+$/, "")}.explore.mmd`);
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(defaultPath), filters: { Mermaid: ["mmd"] } });
    if (target && view) {
      await fs.promises.writeFile(target.fsPath, view.mermaid, "utf8");
      vscode.window.showInformationMessage(`View saved: ${target.fsPath}`);
    }
    this.settle();
  }

  /** The Code Explorer panel, created on first use; resolves once its webview is listening. */
  private static async openPanel(context: vscode.ExtensionContext, target: string): Promise<vscode.WebviewPanel> {
    let panel = this.panel;
    if (panel) {
      panel.reveal(panel.viewColumn, false);
      await this.ready;
    } else {
      panel = vscode.window.createWebviewPanel(
        "vscode-mermaid-extension.codeExplorer",
        "Explore",
        { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
        {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, "dist"))],
          retainContextWhenHidden: true,
        }
      );
      const created = panel;
      this.panel = created;
      this.ready = new Promise((resolve) => {
        created.webview.onDidReceiveMessage((message) => {
          if (message?.command === "ready") {
            resolve();
          } else if (created === this.panel) {
            this.onMessage(message);
          }
        });
      });
      created.onDidDispose(() => {
        if (this.panel === created) {
          this.panel = undefined;
          this.ready = undefined;
          this.session = undefined;
          this.shown = undefined;
        }
      });
      created.webview.html = diagramWebviewHtml(context.extensionPath, created);
      await this.ready;
    }
    panel.title = `Explore · ${path.basename(target)}`;
    panel.webview.postMessage({ command: "explorerMode" });
    return panel;
  }
}

/**
 * Folder labels are relative to this: the workspace folder holding the file,
 * else the nearest folder at or above it with a project marker, else its folder.
 */
function explorerRoot(file: string): string {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath;
  if (folder) {
    return folder;
  }
  for (let dir = path.dirname(path.resolve(file)); ; dir = path.dirname(dir)) {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    if (names.some((name) => MARKER_RULES.some((rule) => rule.matches(name)))) {
      return dir;
    }
    if (path.dirname(dir) === dir) {
      return path.dirname(path.resolve(file));
    }
  }
}

/**
 * Rule 6 of ProviderGraph: inside an open workspace folder (or, with none open,
 * the module root) and not inside an ignored folder.
 */
function inWorkspace(file: string, root: string): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(file))?.uri.fsPath ?? (within(file, root) ? root : undefined);
  if (!folder) {
    return false;
  }
  return !path
    .relative(folder, file)
    .split(path.sep)
    .some((part) => IGNORED_FOLDERS.has(part));
}
