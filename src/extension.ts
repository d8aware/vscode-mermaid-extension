import * as vscode from "vscode";
import { ViewDiagramCommand } from "./commands/ViewDiagramCommand";
import { GenerateClassDiagramCommand } from "./commands/GenerateClassDiagramCommand";
import { CodeExplorerCommand } from "./commands/CodeExplorerCommand";
import { runProbe } from "./probe/languageProbe";
import { recordAnswers } from "./probe/recordAnswers";

export function activate(context: vscode.ExtensionContext) {
  console.log('"vscode-mermaid-extension" extension is now active!');

  // Store the view command instance for reuse in single preview mode
  const viewCommandInstance = new ViewDiagramCommand();

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-mermaid-extension.showDiagramView",
      () => {
        viewCommandInstance.fromActiveTextEditor(context);
      }
    )
  );

  // Helper function to update preview for active .mmd document
  const updatePreviewIfNeeded = () => {
    const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
    const useSinglePreview = config.get<boolean>('useSinglePreview', false);

    if (!useSinglePreview) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;
    
    // Check if the active document is a .mmd or .mermaid file
    if (document.fileName.endsWith('.mmd') || document.fileName.endsWith('.mermaid')) {
      const sharedPanel = ViewDiagramCommand.getSharedPanel();
      
      // If the shared panel exists, update it regardless of visibility
      // This ensures it updates even when hidden in the same tab group
      if (sharedPanel) {
        viewCommandInstance.updatePanelForDocument(document, context);
      }
    }
  };

  // Listen for active editor changes to support single preview mode
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updatePreviewIfNeeded();
    })
  );

  // Listen for visible editors changes (catches preview mode editor replacements)
  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors((editors) => {
      updatePreviewIfNeeded();
    })
  );

  // Listen for when text documents are opened (catches all document opens)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => {
      // Small delay to ensure the editor is fully activated
      setTimeout(() => {
        updatePreviewIfNeeded();
      }, 50);
    })
  );

  /**
   * Runs a class diagram generation with a cancellable progress notification,
   * then opens the written diagram and its preview.
   */
  const generateAndOpen = (generate: (command: GenerateClassDiagramCommand) => Promise<string | undefined>) =>
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing TypeScript files",
        cancellable: true,
      },
      async (progress, token) => {
        const filePath = await generate(new GenerateClassDiagramCommand(progress, token));
        if (!filePath) {
          return;
        }
        try {
          const document = await vscode.workspace.openTextDocument(filePath);
          await vscode.window.showTextDocument(document);
          try {
            await vscode.commands.executeCommand("vscode-mermaid-extension.showDiagramView");
          } catch (error) {
            vscode.window.showErrorMessage(`Failed to open webview: ${error.message}`);
          }
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
        }
      }
    );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-mermaid-extension.generateClassDiagram", (uri: vscode.Uri) =>
      generateAndOpen((command) => command.fromTypeScriptAtPath(uri.fsPath))
    ),
    vscode.commands.registerCommand("vscode-mermaid-extension.generateFocusedClassDiagram", (uri?: vscode.Uri) => {
      // From the Explorer or editor context menu `uri` is the file; from the
      // Command Palette it is undefined, so use the active editor.
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!filePath) {
        vscode.window.showInformationMessage("Open or select a TypeScript file first.");
        return;
      }
      return generateAndOpen((command) => command.fromTypeScriptFile(filePath));
    }),
    ...CodeExplorerCommand.register(context),
    // Spike: what can installed language extensions tell the explorer?
    vscode.commands.registerCommand("vscode-mermaid-extension.checkLanguageSupport", (uri?: vscode.Uri) => runProbe(uri)),
    vscode.commands.registerCommand("vscode-mermaid-extension.recordExplorerAnswers", (uri?: vscode.Uri) => recordAnswers(uri))
  );
}

export function deactivate() {}
