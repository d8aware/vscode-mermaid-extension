import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * HTML for a diagram webview (the preview and the class explorer): dist/index.html
 * with its script and stylesheets rewritten to webview URIs.
 */
export function diagramWebviewHtml(extensionPath: string, panel: vscode.WebviewPanel): string {
  /**
   * Generate HTML content
   */
  const htmlFilePath = path.join(extensionPath, "dist", "index.html");
  const htmlContent = fs.readFileSync(htmlFilePath, "utf8");
  let parsedContent = htmlContent.replace(
    /<script src="bundle.js"><\/script>/,
    `<script src="${panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(extensionPath, "dist", "bundle.js"))
    )}"></script>`
  );
  parsedContent = parsedContent.replace(
    /<link rel="stylesheet" href="media\/styles.css" \/>/,
    `<link rel="stylesheet" href="${panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath, "dist", "media", "styles.css")
      )
    )}">`
  );
  parsedContent = parsedContent.replace(
    /<link rel="stylesheet" href="media\/tailwind.min.css" \/>/,
    `<link rel="stylesheet" href="${panel.webview.asWebviewUri(
      vscode.Uri.file(
        path.join(extensionPath, "dist", "media", "tailwind.min.css")
      )
    )}">`
  );

  return parsedContent;
}
