# Change Log

All notable changes to the "vscode-mermaid-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## 1.0.3
- Stops reset of Pan/Zoom/Position when source document is edited.
- When generating class diagrams, any relative file path containing `node_modules` will be ignored.
- For files that export variables or functions, "Generate Class Diagram" will now render a synthetic `<<module>>` class.
- Fixes a transient loading issue by setting mermaid's `startOnLoad` setting to false.

## 1.0.2
- Changed the placement of the "Generate Class Diagram" command.  It is now in the group further down the context menu instead of the first item.
- Moved the priority of the "View Diagram" button to be higher to ensure that the icon is visible when other extensions are active that also target MMD files.
- Replaced the "View Diagram" button with an icon. When mouse over this icon, "View Diagram" will display in a tooltip.

## 1.0.1
- Initial release