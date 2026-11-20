import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  DetailLevel,
  findTsConfig,
  generateClassDiagram,
  GenerateOptions,
  GenerationCancelledError,
  loadFolder,
  summarize,
} from "../classDiagram/ClassDiagramGenerator";

export const OUTPUT_FILE_NAME = ".classes.mmd";

type Progress = vscode.Progress<{ message?: string; increment?: number }>;

/**
 * Generate Class Diagram commands: a whole folder (`.classes.mmd` in the
 * folder) or a focused diagram for one file (`<File>.classes.mmd` next to it).
 * The analysis lives in ClassDiagramGenerator; this class is the editor glue
 * (settings, quick pickers, progress, cancellation, messages, writing files).
 */
export class GenerateClassDiagramCommand {
  constructor(private readonly progress: Progress, private readonly token: vscode.CancellationToken) {}

  /** Returns the path of the written diagram, or undefined if none was written. */
  async fromTypeScriptAtPath(folderPath: string): Promise<string | undefined> {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      vscode.window.showErrorMessage(`Folder not found: ${folderPath}`);
      return undefined;
    }
    return this.run(async () => {
      this.progress.report({ message: "Loading TypeScript project…" });
      const { sourceFiles } = loadFolder(folderPath, { includeTestFiles: setting("includeTestFiles", false) });
      const summary = summarize(sourceFiles, folderPath);
      if (summary.declarations === 0) {
        vscode.window.showInformationMessage("No TypeScript classes, interfaces, enums or object types found in this folder.");
        return undefined;
      }

      const view = await chooseFolderView(summary);
      if (!view) {
        return undefined; // picker dismissed
      }
      const diagram = await generateClassDiagram(sourceFiles, {
        ...this.progressOptions(),
        detail: view.detail,
        groupByFolderFrom: view.groupByFolder ? folderPath : undefined,
      });
      return this.write(diagram, path.join(folderPath, OUTPUT_FILE_NAME));
    });
  }

  /**
   * Focused diagram: the classes in `filePath`, plus every class in the same
   * project with an arrow to or from them.
   */
  async fromTypeScriptFile(filePath: string): Promise<string | undefined> {
    if (!fs.existsSync(filePath)) {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return undefined;
    }
    return this.run(async () => {
      this.progress.report({ message: "Loading TypeScript project…" });
      const root = projectRootFor(filePath);
      const { sourceFiles } = loadFolder(root, {
        includeTestFiles: setting("includeTestFiles", false),
        alwaysInclude: [filePath],
      });
      const focused = sourceFiles.filter((sf) => path.resolve(sf.getFilePath()) === path.resolve(filePath));
      if (summarize(focused, root).declarations === 0) {
        vscode.window.showInformationMessage("No TypeScript classes, interfaces, enums or object types found in this file.");
        return undefined;
      }

      const detail = setting<DetailLevel | "ask">("detail", "ask");
      const diagram = await generateClassDiagram(sourceFiles, {
        ...this.progressOptions(),
        focusFiles: [filePath],
        // Neighbours; the focused classes are always shown in full.
        detail: detail === "ask" ? "public" : detail,
        groupByFolderFrom: setting<"ask" | "always" | "never">("groupByFolder", "ask") === "always" ? root : undefined,
      });
      const baseName = path.basename(filePath).replace(/\.[cm]?tsx?$/, "");
      return this.write(diagram, path.join(path.dirname(filePath), `${baseName}.classes.mmd`));
    });
  }

  private async run(work: () => Promise<string | undefined>): Promise<string | undefined> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof GenerationCancelledError) {
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Class diagram generation failed: ${message}`);
      return undefined;
    }
  }

  private progressOptions(): Pick<GenerateOptions, "isCancelled" | "onProgress"> {
    let reported = 0;
    return {
      isCancelled: () => this.token.isCancellationRequested,
      onProgress: (done, total, fileName) => {
        // `increment` is a delta towards 100.
        const percent = (done / total) * 100;
        this.progress.report({ increment: percent - reported, message: `${done}/${total} ${fileName}` });
        reported = percent;
      },
    };
  }

  private async write(diagram: string, outputPath: string): Promise<string> {
    await fs.promises.writeFile(outputPath, diagram, "utf8");
    vscode.window.showInformationMessage(`File generated: ${outputPath}`);
    return outputPath;
  }
}

function setting<T>(key: string, fallback: T): T {
  return vscode.workspace.getConfiguration("vscode-mermaid-extension").get<T>(`classDiagram.${key}`, fallback);
}

/** Folder of the file's nearest tsconfig, else its workspace folder, else its own folder. */
export function projectRootFor(filePath: string): string {
  const tsConfig = findTsConfig(path.dirname(filePath));
  if (tsConfig) {
    return path.dirname(tsConfig);
  }
  return vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath))?.uri.fsPath ?? path.dirname(filePath);
}

/**
 * Detail level and grouping for a folder diagram, from the settings or, for
 * large folders when the settings say "ask", from quick pickers.
 * Undefined when a picker was dismissed.
 */
async function chooseFolderView(summary: {
  declarations: number;
  folders: number;
}): Promise<{ detail: DetailLevel; groupByFolder: boolean } | undefined> {
  const large = summary.declarations > setting("largeFolderThreshold", 40);
  const detailSetting = setting<DetailLevel | "ask">("detail", "ask");
  const groupSetting = setting<"ask" | "always" | "never">("groupByFolder", "ask");
  const steps = (detailSetting === "ask" && large ? 1 : 0) + (groupSetting === "ask" && large && summary.folders > 1 ? 1 : 0);
  let step = 0;
  const title = () => `Large folder: ${summary.declarations} classes and types${steps > 1 ? ` (${++step}/${steps})` : ""}`;

  let detail: DetailLevel = detailSetting === "ask" ? "full" : detailSetting;
  if (detailSetting === "ask" && large) {
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Public members only", description: "Recommended", detail: "Hide private and protected members", value: "public" as const },
        { label: "All members", detail: "Every field and method", value: "full" as const },
        { label: "Class names only", detail: "No members; just the boxes and arrows", value: "names" as const },
      ],
      { title: title(), placeHolder: "Which members should the diagram show?", ignoreFocusOut: true }
    );
    if (!picked) {
      return undefined;
    }
    detail = picked.value;
  }

  let groupByFolder = groupSetting === "always";
  if (groupSetting === "ask" && large && summary.folders > 1) {
    const picked = await vscode.window.showQuickPick(
      [
        { label: "Group by folder", detail: `Draw a box around each of the ${summary.folders} folders' classes`, value: true },
        { label: "Don't group", value: false },
      ],
      { title: title(), placeHolder: "Group classes by folder?", ignoreFocusOut: true }
    );
    if (!picked) {
      return undefined;
    }
    groupByFolder = picked.value;
  }

  return { detail, groupByFolder };
}
