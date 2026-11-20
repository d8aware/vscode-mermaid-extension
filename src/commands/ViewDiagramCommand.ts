import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { debounce } from "../shared/debounce";
import { diagramWebviewHtml } from "./webviewContent";

export class ViewDiagramCommand {
  currentPanel: vscode.WebviewPanel | undefined;
  
  // Static properties for single preview mode
  private static sharedPanel: vscode.WebviewPanel | undefined;
  private static currentDocument: vscode.TextDocument | undefined;
  private static documentChangeListener: vscode.Disposable | undefined;

  // A webview can only receive messages once its script has loaded and
  // registered its "message" listener; anything posted earlier is dropped
  // (which left the first preview stuck on its loading spinner). Each panel's
  // webview posts "ready" when it is listening; until then we only remember
  // which document the panel should show.
  private static readyPanels = new WeakSet<vscode.WebviewPanel>();
  private static panelDocuments = new WeakMap<vscode.WebviewPanel, vscode.TextDocument>();

  private static listenForReady(panel: vscode.WebviewPanel) {
    panel.webview.onDidReceiveMessage((message) => {
      if (message?.command !== "ready") {
        return;
      }
      ViewDiagramCommand.readyPanels.add(panel);
      const document = ViewDiagramCommand.panelDocuments.get(panel);
      if (document) {
        panel.webview.postMessage({
          command: "renderContent",
          content: document.getText(),
        });
      }
    });
  }

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
    
    ViewDiagramCommand.listenForReady(ViewDiagramCommand.sharedPanel);
    ViewDiagramCommand.sharedPanel.webview.html =
      diagramWebviewHtml(context.extensionPath, ViewDiagramCommand.sharedPanel);

    // Handle panel disposal
    ViewDiagramCommand.sharedPanel.onDidDispose(() => {
      this.cleanupDocumentListener();
      ViewDiagramCommand.sharedPanel = undefined;
      ViewDiagramCommand.currentDocument = undefined;
    });

    // Handle panel view state changes (docking, moving, resizing)
    ViewDiagramCommand.sharedPanel.onDidChangeViewState(() => {
      if (ViewDiagramCommand.sharedPanel && ViewDiagramCommand.sharedPanel.visible) {
        // Notify webview to resize pan/zoom controls
        ViewDiagramCommand.sharedPanel.webview.postMessage({
          command: "resize"
        });
      }
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
    ViewDiagramCommand.listenForReady(this.currentPanel);
    this.currentPanel.webview.html =
      diagramWebviewHtml(context.extensionPath, this.currentPanel);

    // Handle panel view state changes (docking, moving, resizing)
    this.currentPanel.onDidChangeViewState(() => {
      if (this.currentPanel && this.currentPanel.visible) {
        // Notify webview to resize pan/zoom controls
        this.currentPanel.webview.postMessage({
          command: "resize"
        });
      }
    });

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

    // Initial content: send now if the webview is already listening,
    // otherwise its "ready" message triggers the render (see listenForReady).
    setTitle();
    ViewDiagramCommand.panelDocuments.set(this.currentPanel, document);
    if (ViewDiagramCommand.readyPanels.has(this.currentPanel)) {
      this.currentPanel.webview.postMessage({
        command: "renderContent",
        content: document.getText(),
      });
    }
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
}
