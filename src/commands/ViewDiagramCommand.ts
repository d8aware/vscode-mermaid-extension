import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debounce } from "../shared/debounce";

export class ViewDiagramCommand {
  currentPanel: vscode.WebviewPanel | undefined;

  fromActiveTextEditor(context: vscode.ExtensionContext) {
    this.currentPanel = vscode.window.createWebviewPanel(
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
    this.currentPanel.webview.html =
      this.getWebViewContent(context.extensionPath);

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const document = editor.document;
      const setTitle = () => {
        const pathParts = path.normalize(document.fileName).split(/[\\/]/);
        const titleParts = [];
        const fileName = pathParts.pop();
        titleParts.push(fileName);
        const parentFolder = pathParts.pop();
        if (parentFolder !== undefined) {
          titleParts.push(parentFolder);
        }
        const grandParentFolder = pathParts.pop();
        if (grandParentFolder !== undefined) {
          titleParts.push(grandParentFolder);
        }
        const docTitle = titleParts.reverse().join(" > ");
        
        this.currentPanel.title = `${docTitle} - Diagram View`;
      };
      // Listen for changes to the document
      vscode.workspace.onDidChangeTextDocument(debounce((event) => {
        if (event.document === document) {
          setTitle();
          const newText = document.getText();
          this.currentPanel.webview.postMessage({
            command: "renderContent",
            content: newText,
          });
        }
      }, 500));
      // Initial content
      setTitle();
      const initialText = document.getText();
      this.currentPanel.webview.postMessage({
        command: "renderContent",
        content: initialText,
      });
    }
  }

  private getWebViewContent(extensionPath: string) {
    /**
     * Generate HTML content
     */
    const htmlFilePath = path.join(extensionPath, "dist", "index.html");
    const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
    let parsedContent = htmlContent.replace(
      /<script src="bundle.js"><\/script>/,
      `<script src="${this.currentPanel.webview.asWebviewUri(
        vscode.Uri.file(path.join(extensionPath, "dist", "bundle.js"))
      )}"></script>`
    );
    parsedContent = parsedContent.replace(
      /<link rel="stylesheet" href="media\/styles.css" \/>/,
      `<link rel="stylesheet" href="${this.currentPanel.webview.asWebviewUri(
        vscode.Uri.file(
          path.join(extensionPath, "dist", "media", "styles.css")
        )
      )}">`
    );
    parsedContent = parsedContent.replace(
      /<link rel="stylesheet" href="media\/tailwind.min.css" \/>/,
      `<link rel="stylesheet" href="${this.currentPanel.webview.asWebviewUri(
        vscode.Uri.file(
          path.join(extensionPath, "dist", "media", "tailwind.min.css")
        )
      )}">`
    );

    return parsedContent;
  }
}
