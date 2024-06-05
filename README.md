# Mermaid.js Diagrams Extension for Visual Studio Code

## Overview

Welcome to the Mermaid.js Diagrams Extension for Visual Studio Code! This extension is designed to enhance developer productivity by integrating diagram visualization directly into your codebase. With this extension, you can easily render Mermaid.js diagrams and generate class diagrams from your TypeScript files, keeping your design in sync with your code.

## Features

### 1. Diagram Viewer
- **Render `.mmd` Files:** View Mermaid.js diagrams directly within Visual Studio Code by rendering `.mmd` (Mermaid markdown) files.
- **Keep Design and Code in Sync:** By keeping diagram artifacts close to your code, you ensure that your design stays up-to-date with the actual implementation.

### 2. Class Diagram Generator
- **Generate Class Diagrams:** Right-click on any folder in the Visual Studio Code explorer and generate a class diagram describing all TypeScript classes found within the files in that folder.
- **Focused Visualization:** Save the generated diagram as `.classes.mmd` in the selected folder, allowing you to visualize specific areas of your codebase or the entire system.

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
2. The diagram will be rendered automatically in a preview pane.

### Generating Class Diagrams
1. Right-click on any folder in the Visual Studio Code explorer.
2. Select "Generate Class Diagram."
3. A file named `.classes.mmd` will be created in the selected folder with the class diagram.

## Contributing

This extension is open source, and contributions are welcome! If you have any ideas for new features or improvements, please feel free to submit an issue or a pull request on the [GitHub repository](https://github.com/d8aware/vscode-mermaid-extension).

## License

This project is licensed under the MIT License. See the [LICENSE](https://github.com/d8aware/vscode-mermaid-extension/blob/main/LICENSE) file for details.
