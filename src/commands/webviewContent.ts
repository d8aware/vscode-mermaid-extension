import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * HTML for a diagram webview (the preview and the class explorer): dist/index.html
 * with its script and stylesheets rewritten to webview URIs.
 */
/** Open diagram panels, told when the colour setting changes. */
const panels = new Set<vscode.WebviewPanel>();

/** `vscode-mermaid-extension.diagramColors`: "light" or "editor". */
export function diagramColors(): "light" | "editor" {
  return vscode.workspace.getConfiguration("vscode-mermaid-extension").get<string>("diagramColors") === "editor" ? "editor" : "light";
}

/** Sends the colour setting to every open diagram panel (they draw again). */
export function broadcastDiagramColors() {
  const mode = diagramColors();
  panels.forEach((panel) => panel.webview.postMessage({ command: "colors", mode }));
}

export function diagramWebviewHtml(extensionPath: string, panel: vscode.WebviewPanel): string {
  if (!panels.has(panel)) {
    panels.add(panel);
    panel.onDidDispose(() => panels.delete(panel));
  }
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

  // The colour setting, read by the page before its first render.
  parsedContent = parsedContent.replace(/<body /, `<body data-colors="${diagramColors()}" `);
  return parsedContent;
}
