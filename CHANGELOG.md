# Change Log

All notable changes to the "vscode-mermaid-extension" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## 3.1.0

### Added

- **Diagrams in your VS Code theme's colours** (setting `vscode-mermaid-extension.diagramColors`: `editor`; the default `light` keeps today's look). Previews and the Code Explorer, panel included, take their colours from the active theme, light, dark or high contrast, and follow it when you switch themes. Each colour the views use is a role (box, entry point, neighbour, outside, the file's own classes, "you clicked", "came from"), drawn in the theme's colour for that role; colours a theme leaves out, or that would be hard to read, fall back to its text and background colours. A diagram that sets its own Mermaid theme keeps it, and saved views keep their light colours so they look the same anywhere.
- **Barrel files** (`public-api.ts`, `index.ts`, Python `__init__.py`, Rust `mod.rs`/`lib.rs`) that declare no types of their own start the class view from the types they re-export, and the panel says so. TypeScript follows `export … from`; Python and Rust ask the language extension where each re-exported name is defined.

### Fixed

- **Explore Classes From Here no longer spins forever** when a file has nothing to show (no classes, a cancelled pick, a failure): the loading scene now closes and the notice explains why.

## 3.0.0

**Explore any codebase as diagrams, from the whole repository down to a single class, in any language with a VS Code language extension.** Right-click a folder to see its projects and their declared dependencies, click a project to see its code folder by folder from its entry points, click a file to explore its classes. Every box and arrow comes from a written rule, so the same code always draws the same picture. Also: the TypeScript class diagram generator is rewritten and now draws the relationships between classes.

Nothing is removed and no settings change meaning; the major version marks the change in scope.

### Added

- **Explore From Here** (right-click a folder): the projects inside it, labelled by kind and name, and the references they declare between them. Projects are found by marker files: npm, Angular and Nx (`package.json`, `angular.json`, `nx.json`, `project.json`, `tsconfig.json`), .NET (`*.sln`, `*.csproj`), Composer, Go (`go.work`, `go.mod`), Python (`pyproject.toml`, `requirements.txt`, `setup.py`), Maven and Gradle, Cargo, and Docker, Jenkins and Terraform. Arrows come only from declared references: imports of local packages and tsconfig path aliases, Go module imports, Rust crate uses, and the dependencies in `package.json`, `composer.json`, `go.mod` (`require`, local `replace`), `pyproject.toml`/`requirements.txt`, `pom.xml`, `Cargo.toml` and .NET `<ProjectReference>`. Hover a box to see which rule produced it.
- **Project view**: click a project to see its code a folder at a time. It opens at the project's declared source root (`angular.json`/`project.json` `sourceRoot`, Composer `psr-4`, Maven's `src/main/java`, `pyproject.toml` `package-dir`, the Cargo crate root) and marks entry points: what the project files declare (a build target's `main`, `package.json` `main`/`bin`/`exports`, `[project.scripts]`, Cargo targets, Composer `bin`) and what the language marks (`package main`, `static Main` or top-level statements, `public static void main`, `fn main`, `if __name__ == "__main__"`). Arrows are the imports between folders and files, plus boxes for the other projects they use. Click a folder to go deeper, a file to explore its classes.
- **Explore Classes From Here** (right-click a source file, or click one in a project view): the file's classes in full, with the classes one step away (supertypes, subtypes, used classes and consumers) as dashed boxes; click one to bring it in, click a class to open its source, "+N more" for the rest. TypeScript is analysed by the extension itself. Every other language is answered by its installed language extension, checked against recorded examples for Go (`golang.go`), C# (`ms-dotnettools.csharp`), PHP (Intelephense), Python (Pylance), Java/Kotlin (`redhat.java`) and Rust (rust-analyzer); Swift, Scala, Dart, C/C++, Ruby and others use the same rules. Where an extension has no type hierarchy, supertypes and subtypes come from class declarations (`class A extends B`) and from blocks declared apart (Rust `impl Store for MemStore`), and field types from the names in each field's declaration; the panel says when such a fallback answered. Methods declared apart from their type (Go receivers, Rust `impl` blocks) join their type's box.
- **One panel for all of it**, in the main editor area: breadcrumb, Back, Start over and Save view (as `.mmd`) work from the repository down to classes. Each step keeps you oriented: a level badge (Projects, Code, Classes), a zoom into the box you clicked when going deeper and out when going back, boxes that glide to their new places when a class view grows, and rings on the box you clicked and the one you came from. Results are cached and refreshed when you save a file.
- **Mermaid: Check Explorer Language Support**: for the open file, what the explorer will use per direction (the extension's answer, a fallback rule, or nothing), and which extension to install when none answers.
- **`classDiagram.explorerConsumers`** setting for TypeScript: `declared` (default; fields and constructor injection) or `references` (every class that references it, asked of the TypeScript extension).
- **Language packs** ([docs](docs/language-packs.md)): every language- and ecosystem-specific rule lives in a small pack file, so adding a language is a pack and a recorded example.
- **Focused class diagrams**: right-click a TypeScript file → "Generate Focused Class Diagram" shows that file's classes (outlined, all members) with every class connected to them anywhere in the project (public members). Written to `<File>.classes.mmd` next to the file.
- **Large folders**: for folders with more than 40 classes, a picker asks which members to show (public members only, all members, or class names only) and, when the classes span several folders, whether to group them by folder. Settings `classDiagram.detail`, `classDiagram.groupByFolder` and `classDiagram.largeFolderThreshold` set these defaults and skip the picker.
- Example galleries that double as golden tests: class diagrams (`test-files/class-diagram/`), repository and project views (`test-files/landscape/`), and the same class explorer example in seven languages (`test-files/explorer/`).

### Changed

- **Class diagram generator rewritten.** Tested against real TypeScript projects, the previous generator drew almost no relationships between classes. The new one:
  - **Draws relationships between classes**: fields, getters and constructor parameter properties referencing other classes (including inside arrays, generics such as `Map<…>` / `Promise<…>`, and unions) become labelled association arrows. Previously the comparison never matched, so these arrows were missing.
  - **Shows constructor-injected dependencies**: plain constructor parameters are drawn as dependency arrows.
  - **Uses your project's `tsconfig.json`** (or a monorepo's `tsconfig.base.json`), so imports through path aliases resolve and output no longer changes with the bundled TypeScript version.
  - **Uses correct Mermaid syntax**: methods no longer show a doubled colon (`deposit(amount) : : void`); interface `extends` is drawn as inheritance rather than implementation; generic types such as `Map<string, Order[]>` display correctly.
  - **Adds UML details**: visibility markers for private (`-`) and protected (`#`) members (previously everything was shown as public), static (underlined) and abstract (italic) members, `<<abstract>>` classes, generic class names, optional fields, and getters/setters.
  - **Keeps same-named classes in different files as separate boxes** instead of merging them.
  - **Reads more files and declarations**: `.tsx`, `.mts` and `.cts` files, object-shaped `type` aliases and classes inside namespaces.
- **Test files are skipped by default** (`*.spec.*`, `*.test.*`, `__tests__/`), as are `*.d.ts` files. New setting `vscode-mermaid-extension.classDiagram.includeTestFiles` includes test files.
- Updated `ts-morph` from 27 to 28 (bundles TypeScript 6).

### Fixed

- **Generating a class diagram could leave the progress notification spinning forever** if analysis failed. Errors are now reported, the progress bar advances per file, and generation can be cancelled.

## 2.0.0

### Changed

- **Mermaid 12**: Updated `mermaid` from 11.17.2 to 12.3.0. Diagrams now use Mermaid's new defaults: the ELK layout engine and the modern look and theme, so existing flowchart, class, state and ER diagrams will be laid out and coloured differently. To keep the classic Mermaid 11 style for a diagram, add frontmatter (see README, "Diagram Style"):
  ```
  ---
  config:
    layout: dagre
    look: classic
    theme: default
  ---
  ```

### Fixed

- **Preview stuck on the loading spinner**: The first preview opened could stay on the spinner until refreshed. The extension sent the diagram before the preview had finished loading, so the message was lost. The preview now signals when it is ready and the diagram is sent then.
- **Live updates and resizing errors**: The debounce helper used by live preview updates (re-rendering as you edit) and by window resizing referenced an undefined variable and threw `ReferenceError: context is not defined` when it fired.
- **Gantt charts**: Charts now fit the preview instead of rendering in a fixed `1458×196` box. A "today" marker far outside the chart's date range (e.g. an old plan) no longer distorts the view, and date axis labels no longer overlap.

### Security

- Resolves the remaining `katex` advisory (fixed in mermaid ≥ 12.1).

## 1.1.1

### Security

- Updated `mermaid` from 11.12.2 to 11.17.2, fixing published advisories for CSS injection via `classDef`/`classDefs` and configuration, prototype pollution in configuration APIs and architecture diagrams, and denial-of-service in Gantt, XY chart and radar diagrams
- Updated transitive runtime dependencies (`dompurify`, `lodash-es`, `picomatch`, `uuid`) to patched versions
- Updated development tooling (webpack, webpack-dev-server, typescript-eslint, eslint and others) and resolved transitive advisories via `npm audit fix`

### Fixed

- Spurious "Rendering Problem" overlay (`Failed to execute 'scale' on 'SVGMatrix'`) when a diagram is rendered without previous pan/zoom state to restore, e.g. in the browser preview harness (`npm run serve`)

### Removed

- Unused `glob` runtime dependency

### Maintenance

- Added a GitHub Actions CI workflow (lint, build, integration tests, runtime dependency audit)
- Dependabot now groups minor/patch dev-dependency updates, covers GitHub Actions, and ignores `@types/vscode` (which must track `engines.vscode`)

## 1.1.0

### Added

- **Single Preview Mode**: New configuration setting `useSinglePreview` enables a unified preview experience similar to Markdown preview
  - Preview automatically updates when switching between `.mmd` or `.mermaid` file tabs (when single preview mode is enabled)
  - Support for both single preview mode (unified) and multi-panel mode (default)
  - Intelligent document change tracking that follows the active .mmd/.mermaid file
  - Proper cleanup of event listeners when switching documents or closing preview

- **`.mermaid` File Extension Support**: Extension now supports both `.mmd` and `.mermaid` file extensions
  - View diagram button appears for both file types
  - Single preview mode works with both file types
  - All features work identically for both extensions

### Fixed

- **Pan/Zoom Controls Rendering**: Fixed issue where pan and zoom controls would not render correctly when the preview panel is docked, moved, or resized
  - Added `onDidChangeViewState` listener to detect panel layout changes
  - Webview now automatically resizes and recenters pan/zoom controls when panel state changes
  - No longer requires reactivating the .mmd editor to restore proper zoom controls

- **Single Preview Mode - Preview Tab Switching**: Fixed issue where preview wouldn't update in certain editor state scenarios
  - Added `onDidChangeVisibleTextEditors` listener to catch preview mode editor replacements
  - Added `onDidOpenTextDocument` listener to catch all document opens from file tree
  - Preview now updates correctly when clicking .mmd/.mermaid files from file tree (even in preview mode)
  - Preview now updates correctly when double-clicking to promote preview tab to permanent tab
  - Preview updates even when hidden in the same tab group as the editor

### Configuration

- Added `vscode-mermaid-extension.useSinglePreview` setting (default: false)
  - When enabled: Single preview panel updates automatically as you switch between .mmd/.mermaid files
  - When disabled: Each preview command creates a new panel (original behavior)

### Documentation

- Added comprehensive preview modes documentation in `docs/preview-modes.md`
- Updated README.md with prominent Single Preview Mode feature section
- Added Configuration section to README with detailed setup instructions

### Testing

- Added test coverage for configuration settings
- Added tests for ViewDiagramCommand static methods
- Added document tracking tests

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
