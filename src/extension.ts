import * as vscode from "vscode";
import { ViewDiagramCommand } from "./commands/ViewDiagramCommand";
import { GenerateClassDiagramCommand } from "./commands/GenerateClassDiagramCommand";

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

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-mermaid-extension.generateClassDiagram",
      (uri: vscode.Uri) => {
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Analyzing TypeScript files",
            cancellable: false // for now...
        }, async (progress, token) => {
          const filePath = await new GenerateClassDiagramCommand(progress, token).fromTypeScriptAtPath(uri.fsPath);
          if (filePath) {
            try {
              const document = await vscode.workspace.openTextDocument(filePath);
              await vscode.window.showTextDocument(document);

              try {
                await vscode.commands.executeCommand('vscode-mermaid-extension.showDiagramView');
              } catch (error) {
                  vscode.window.showErrorMessage(`Failed to open webview: ${error.message}`);
              }
            } catch (error) {
              vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
            }
          }
        });
      }
    )
  );
}

export function deactivate() {}
