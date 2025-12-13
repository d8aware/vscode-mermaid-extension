import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debounce } from "../shared/debounce";

export class ViewDiagramCommand {
  currentPanel: vscode.WebviewPanel | undefined;
  
  // Static properties for single preview mode
  private static sharedPanel: vscode.WebviewPanel | undefined;
  private static currentDocument: vscode.TextDocument | undefined;
  private static documentChangeListener: vscode.Disposable | undefined;

  fromActiveTextEditor(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
    const useSinglePreview = config.get<boolean>('useSinglePreview', false);

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }

    const document = editor.document;

    if (useSinglePreview) {
      // Single preview mode: reuse or create shared panel
      if (ViewDiagramCommand.sharedPanel && ViewDiagramCommand.sharedPanel.visible) {
        // Panel exists and is visible, update it
        this.currentPanel = ViewDiagramCommand.sharedPanel;
        this.updatePanelForDocument(document, context);
      } else {
        // Panel doesn't exist or was closed, create new one
        this.createSharedPanel(context, document);
      }
    } else {
      // Multi-panel mode: create new panel (current behavior)
      this.createNewPanel(context, document);
    }
  }

  private createSharedPanel(context: vscode.ExtensionContext, document: vscode.TextDocument) {
    ViewDiagramCommand.sharedPanel = vscode.window.createWebviewPanel(
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
    
    ViewDiagramCommand.sharedPanel.webview.html =
      this.getWebViewContent(context.extensionPath, ViewDiagramCommand.sharedPanel);

    // Handle panel disposal
    ViewDiagramCommand.sharedPanel.onDidDispose(() => {
      this.cleanupDocumentListener();
      ViewDiagramCommand.sharedPanel = undefined;
      ViewDiagramCommand.currentDocument = undefined;
    });

    this.currentPanel = ViewDiagramCommand.sharedPanel;
    this.updatePanelForDocument(document, context);
  }

  private createNewPanel(context: vscode.ExtensionContext, document: vscode.TextDocument) {
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
      this.getWebViewContent(context.extensionPath, this.currentPanel);

    this.setupDocumentTracking(document);
  }

  public updatePanelForDocument(document: vscode.TextDocument, context?: vscode.ExtensionContext) {
    if (!this.currentPanel) {
      return;
    }

    // Clean up previous document listener
    this.cleanupDocumentListener();

    // Update tracked document
    ViewDiagramCommand.currentDocument = document;

    // Setup new document listener
    this.setupDocumentTracking(document);
  }

  private setupDocumentTracking(document: vscode.TextDocument) {
    if (!this.currentPanel) {
      return;
    }

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
      
      if (this.currentPanel) {
        this.currentPanel.title = `${docTitle} - Diagram View`;
      }
    };

    // Listen for changes to the document
    const listener = vscode.workspace.onDidChangeTextDocument(debounce((event) => {
      if (event.document === document && this.currentPanel) {
        setTitle();
        const newText = document.getText();
        this.currentPanel.webview.postMessage({
          command: "refreshContent",
          content: newText,
        });
      }
    }, 500));

    // Store the listener for cleanup
    ViewDiagramCommand.documentChangeListener = listener;

    // Initial content
    setTitle();
    const initialText = document.getText();
    this.currentPanel.webview.postMessage({
      command: "renderContent",
      content: initialText,
    });
  }

  private cleanupDocumentListener() {
    if (ViewDiagramCommand.documentChangeListener) {
      ViewDiagramCommand.documentChangeListener.dispose();
      ViewDiagramCommand.documentChangeListener = undefined;
    }
  }

  public static getSharedPanel(): vscode.WebviewPanel | undefined {
    return ViewDiagramCommand.sharedPanel;
  }

  public static getCurrentDocument(): vscode.TextDocument | undefined {
    return ViewDiagramCommand.currentDocument;
  }

  private getWebViewContent(extensionPath: string, panel: vscode.WebviewPanel) {
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
}
