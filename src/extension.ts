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

  // Listen for active editor changes to support single preview mode
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
      const useSinglePreview = config.get<boolean>('useSinglePreview', false);

      if (!useSinglePreview) {
        // Single preview mode is disabled, don't auto-update
        return;
      }

      if (!editor) {
        return;
      }

      const document = editor.document;
      
      // Check if the active document is a .mmd file
      if (document.fileName.endsWith('.mmd')) {
        const sharedPanel = ViewDiagramCommand.getSharedPanel();
        
        // Only update if the shared panel exists and is visible
        if (sharedPanel && sharedPanel.visible) {
          viewCommandInstance.updatePanelForDocument(document, context);
        }
      }
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
