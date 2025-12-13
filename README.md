# Mermaid.js Diagrams Extension for Visual Studio Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/d8aware.vscode-mermaid-extension?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=d8aware.vscode-mermaid-extension)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/d8aware.vscode-mermaid-extension?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=d8aware.vscode-mermaid-extension)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/d8aware.vscode-mermaid-extension?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=d8aware.vscode-mermaid-extension)

## Overview

Welcome to the Mermaid.js Diagrams Extension for Visual Studio Code! This extension is designed to enhance developer productivity by integrating diagram visualization directly into your codebase. With this extension, you can easily render Mermaid.js diagrams and generate class diagrams from your TypeScript files, keeping your design in sync with your code.

## Features

### 1. Diagram Viewer
- **Render `.mmd` Files:** View Mermaid.js diagrams directly within Visual Studio Code by rendering `.mmd` (Mermaid markdown) files.
- **Keep Design and Code in Sync:** By keeping diagram artifacts close to your code, you ensure that your design stays up-to-date with the actual implementation.

### 2. Class Diagram Generator
- **Generate Class Diagrams:** Right-click on any folder in the Visual Studio Code explorer and generate a class diagram describing all TypeScript classes found within the files in that folder.
- **Focused Visualization:** Save the generated diagram as `.classes.mmd` in the selected folder, allowing you to visualize specific areas of your codebase or the entire system.

### 3. Single Preview Mode (NEW)
- **Unified Preview Experience:** Enable single preview mode to work with Mermaid diagrams like Markdown preview - one preview panel that updates as you switch between files.
- **Automatic Switching:** Preview automatically updates when you switch between `.mmd` file tabs, making it easy to review multiple diagrams without cluttering your workspace.
- **Flexible Configuration:** Toggle between single preview mode (unified) and multi-panel mode (side-by-side) via extension settings to match your workflow.

[Learn more about preview modes](docs/preview-modes.md)

## Motivation

### Diagram Viewer
Software teams often design their software domain using diagrams before starting the actual development. Keeping these diagrams close to the code helps ensure that the implementation stays true to the original design. Mermaid.js provides an elegant way to render diagrams using markdown, making it a perfect choice for this purpose.

### Class Diagram Generator
Understanding and visualizing a codebase can be challenging, especially when dealing with large projects or unfamiliar code. By generating class diagrams directly from your TypeScript files, this extension helps developers quickly grasp the domain model and relationships within the code, aiding in faster onboarding and more efficient development.

## Installation

1. Install the extension from the Visual Studio Code marketplace.
2. Reload Visual Studio Code to activate the extension.

## Usage

### Viewing Mermaid.js Diagrams
1. Open any `.mmd` file in Visual Studio Code.
2. Click the diagram icon in the editor title bar to open the preview.
3. The diagram will be rendered in a preview panel with pan and zoom capabilities.

### Generating Class Diagrams
1. Right-click on any folder in the Visual Studio Code explorer.
2. Select "Generate Class Diagram."
3. A file named `.classes.mmd` will be created in the selected folder with the class diagram.

## Configuration

### Single Preview Mode

By default, clicking the view diagram button creates a new preview panel each time, allowing you to view multiple diagrams side-by-side. If you prefer a unified preview experience similar to Markdown preview:

1. Open VS Code Settings (File > Preferences > Settings)
2. Search for "Mermaid"
3. Enable the setting: **"Mermaid MMD Tools: Use Single Preview"**

**Or** add this to your `settings.json`:

```json
{
  "vscode-mermaid-extension.useSinglePreview": true
}
```

**When enabled:**
- Opening a preview creates a single, reusable preview panel
- Switching between `.mmd` file tabs automatically updates the preview
- Closing and reopening the preview works as expected

**When disabled (default):**
- Each preview command creates a new panel
- You can view multiple diagrams side-by-side
- Useful for comparing diagrams or multi-monitor setups

For more details, see the [Preview Modes Documentation](docs/preview-modes.md).

## Contributing

This extension is open source, and contributions are welcome! If you have any ideas for new features or improvements, please feel free to submit an issue or a pull request on the [GitHub repository](https://github.com/d8aware/vscode-mermaid-extension).

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/d8aware/vscode-mermaid-extension/blob/main/LICENSE) file for details.
