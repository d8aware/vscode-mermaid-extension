import * as vscode from "vscode";
import { ViewDiagramCommand } from "./commands/ViewDiagramCommand";
import { GenerateClassDiagramCommand } from "./commands/GenerateClassDiagramCommand";

export function activate(context: vscode.ExtensionContext) {
  console.log('"vscode-mermaid-extension" extension is now active!');

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-mermaid-extension.showDiagramView",
      () => {
        new ViewDiagramCommand().fromActiveTextEditor(context);
      }
    )
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
