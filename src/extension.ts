import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { randomBytes } from "crypto";

let currentPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
  console.log('"vscode-mermaid-extension" extension is now active!');
  context.subscriptions.push(vscode.commands.registerCommand(
    "vscode-mermaid-extension.showPreview",
    () => {
      createOrShowWebView(context);
    }
  ));
}

export function createOrShowWebView(context: vscode.ExtensionContext) {

  // if (!currentPanel) {
    currentPanel = vscode.window.createWebviewPanel(
      "vscode-mermaid-extension",
      "Mermaid Diagram View",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, "dist")),
        ],
        retainContextWhenHidden: true,
      } as vscode.WebviewPanelOptions & vscode.WebviewOptions
    );
  // }
  currentPanel.webview.html = getWebViewContent(context);

  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const document = editor.document;
    const setTitle = () => {
      const docTitle = path.normalize(document.fileName).split(/[\\/]/).pop();
      currentPanel.title = `${docTitle} - Diagram View`;
    };
    // Listen for changes to the document
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === document) {
        setTitle();
        const newText = document.getText();
        currentPanel.webview.postMessage({
          command: "renderContent",
          content: newText,
        });
      }
    });
    // Initial content
    setTitle();
    const initialText = document.getText();
    currentPanel.webview.postMessage({
      command: "renderContent",
      content: initialText,
    });
  }
}

export function getWebViewContent(context: vscode.ExtensionContext) {
  /**
   * Generate HTML content
   */
  const htmlFilePath = path.join(context.extensionPath, "dist", "index.html");
  const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
  let parsedContent = htmlContent.replace(
    /<script src="bundle.js"><\/script>/,
    `<script src="${currentPanel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, "dist", "bundle.js"))
    )}"></script>`
  );
  parsedContent = parsedContent.replace(
    /<link rel="stylesheet" href="media\/styles.css" \/>/,
    `<link rel="stylesheet" href="${currentPanel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(context.extensionPath, "dist", "media", "styles.css")
      )
    )}">`
  );
  parsedContent = parsedContent.replace(
    /<link rel="stylesheet" href="media\/tailwind.min.css" \/>/,
    `<link rel="stylesheet" href="${currentPanel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(context.extensionPath, "dist", "media", "tailwind.min.css")
      )
    )}">`
  );

  return parsedContent;
}

export function deactivate() {}
