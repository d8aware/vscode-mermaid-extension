# Change Log

All notable changes to the "vscode-mermaid-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## 1.0.5

### Dependencies
- Updated glob from 11.1.0 to 13.0.0 for improved file matching performance and latest features.
- Updated ts-morph from 26.0.0 to 27.0.2 for latest TypeScript support and bug fixes.
- Updated @types/vscode from 1.106.1 to 1.107.0 for latest VS Code API types.
- Updated @types/node from 24.10.2 to 25.0.1 for latest Node.js type definitions.
- Updated @vscode/test-cli from 0.0.11 to 0.0.12 for improved testing capabilities.
- Updated eslint from 9.39.1 to 9.39.2 for latest linting rules and bug fixes.

### Configuration
- Fixed ESLint module type warning by renaming `eslint.config.js` to `eslint.config.mjs`.
- Enhanced package.json metadata for better marketplace discoverability:
  - Added keywords: mermaid, diagram, visualization, uml, class diagram, typescript, markdown
  - Updated categories to include "Visualization" and "Programming Languages"
  - Added bugs URL, homepage URL, license field, and Q&A routing
  - Added gallery banner configuration for dark theme
- Updated VS Code engine compatibility from ^1.89.0 to ^1.95.0 for better alignment with recent stable releases.

### Documentation
- Added marketplace badges to README.md (version, installs, rating).
- Improved .vscodeignore to exclude documentation and test files from package, reducing extension size.

### Maintenance
- Comprehensive testing performed to ensure compatibility with updated dependencies.
- All tests passing with latest VS Code version 1.107.0.

## 1.0.4
### Bug Fixes
- Fixed default parameter bug in class diagram generation (Issue #24): TypeScript methods with default parameters like `content = {}` and `useTextExtract = false` now generate valid Mermaid syntax without parse errors.
- Resolved conflicts with Mermaid Markdown Syntax Highlighting extension (Issue #23) by updating activation and menu configurations.

### Improvements
- **Enhanced Extension Activation**: Changed activation event from `onLanguage:mmd` to `onStartupFinished` for better compatibility with other extensions.
- **Streamlined Menu Conditions**: Removed unnecessary `editorLangId` check for the "View Diagram" command to improve menu behavior.
- **Improved Parameter Processing**: Enhanced handling of destructured parameters with nested braces and complex default values.
- **ESLint Configuration Modernization**: Migrated from `.eslintrc.json` to flat configuration format (`eslint.config.js`) for better TypeScript support.

### Documentation
- Added comprehensive architecture documentation (`docs/architecture.md`) detailing the extension's data flow and components.
- Created bug fix documentation (`docs/bug-fixes.md`) with detailed analysis of the default parameter issue and its resolution.
- Introduced domain model diagram (`docs/domain-model.mmd`) showing the extension's class relationships and architecture.

### Testing
- Added comprehensive unit tests for parameter processing logic in class diagram generation.
- Introduced test utilities (`testUtils.ts`) for improved test maintainability and code reuse.
- Enhanced test coverage for edge cases and real-world scenarios.

### Dependencies
- Updated TypeScript, ESLint, and related development dependencies to latest versions.
- Improved `tsconfig.json` configuration for better compilation performance.

### Language Configuration
- Removed unused `.mmd` file language configuration that was causing conflicts with other extensions.

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
