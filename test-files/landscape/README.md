# Landscape examples

**Explore From Here** on a folder shows the projects inside it: what kind each
one is and how they reference each other. Every box, label and arrow comes from
a fixed rule applied to the files (`src/landscape/rules.ts`), so the same files
always give the same picture. Hover any box in the explorer to see which rule
produced it.

`acme/` is a small made-up repository with several technologies side by side:
an Angular workspace, an Nx workspace, a .NET solution, Composer packages, a Go
workspace with two modules, a Python project, a Maven project, a Rust crate, a
Jenkins pipeline, plain folders, and ignored `node_modules` and `dist` folders.
The expected views are in `acme.views/` (kept outside `acme/` so they are not
scanned themselves):

| View | Shows |
|---|---|
| [The folder](acme.views/expected.mmd) | 9 projects, one box for the plain folders, and `web → platform` (4 references: imports of package names, a deep import, an import through a tsconfig path alias, and a `package.json` dependency; a commented-out import does not count) |
| [Inside `platform`](acme.views/expected-platform.mmd) | The Nx workspace's apps and libraries, `web` as a box outside this view, and the workspace's own files |
| [Inside `services/billing`](acme.views/expected-services-billing.mmd) | .NET projects linked by `<ProjectReference>` |
| [Inside `legacy`](acme.views/expected-legacy.mmd) | A Composer package whose `composer.json` requires the package nested inside it |
| [Inside `gateway`](acme.views/expected-gateway.mmd) | A Go workspace (`go.work`): `server → shared` (4 references: two imports of the `shared` module's packages, a `go.mod` `require` and a local `replace`; a commented-out import, a string that looks like an import path and a module outside the repository do not count) |

Clicking a project with no projects inside it opens its **project view**: its
own code a folder at a time (see [the project view rules](#the-project-view)):

| View | Shows |
|---|---|
| [`web`](acme.views/expected-project-web.mmd) | Opens at `src` (`angular.json` `sourceRoot`); `main.ts` is the entry (the build target's `browser`); `app/` uses two library projects |
| [`web` › `src/app`](acme.views/expected-project-web-app.mmd) | Imports between files and folders; `main.ts` outside this folder; the spec file's imports are not drawn |
| [`platform/apps/api`](acme.views/expected-project-api.mmd) | Nx `project.json` paths, written relative to the workspace root |
| [`gateway/server`](acme.views/expected-project-server.mmd) | Go: `package main` with `func main`; a package import inside the module; the `shared` module as another project |
| [`Billing.Api`](acme.views/expected-project-billing-api.mmd) | C#: top-level statements; `using` resolved through declared namespaces |
| [`legacy`](acme.views/expected-project-legacy.mmd) / [`src/Http`](acme.views/expected-project-legacy-http.mmd) | PHP: `composer.json` `bin` lies outside the `psr-4` root, so the view opens at the project folder; `require` of a literal path, `use` through namespaces |
| [`analytics`](acme.views/expected-project-analytics.mmd) | Python: `[project.scripts]` entry, `package-dir` source root, relative and absolute imports |
| [`ledger`](acme.views/expected-project-ledger.mmd) | Java: Maven's standard layout; `com/acme/ledger` passed through (folders holding one folder and no files) |
| [`engine`](acme.views/expected-project-engine.mmd) | Rust: Cargo's target auto-discovery; `mod`, `use crate::` and `use super::` |

## The rules

1. **Ignored folders:** `node_modules`, `.git`, `vendor`, `dist`, `obj`, `.nx`, `.angular`, `coverage`.
2. **Projects:** a folder containing a marker file is a project: `nx.json`,
   `angular.json`, `*.sln`, `*.csproj`, `composer.json`, `package.json`,
   `project.json`, `tsconfig.json`, `Dockerfile`, `Jenkinsfile`, `*.tf`,
   `requirements.txt`, `pyproject.toml`, `setup.py`, `go.work`, `go.mod`,
   `pom.xml`, `build.gradle(.kts)`, `settings.gradle(.kts)`, `Cargo.toml`.
   Presence is all that counts.
3. **Labels:** the kind of the first marker in that order, plus the `name` field
   from `package.json` or `composer.json`, the `module` path from `go.mod`, the
   `pyproject.toml` name, the `pom.xml` `groupId:artifactId`, or the Cargo
   package name.
4. **Arrows,** only from declared references: imports (read with TypeScript's
   import scanner) of a local package `name` or of a `compilerOptions.paths`
   alias from `tsconfig.base.json`/`tsconfig.json`; `package.json`
   dependencies; `<ProjectReference>`; `composer.json` `require`; Go import
   paths inside a local module's path (read from the `import` declarations
   only, so comments and strings don't count; the longest module path wins);
   `go.mod` `require` of a local module and `replace` with a local directory;
   `pyproject.toml` and `requirements.txt` dependencies and Poetry path
   dependencies; `pom.xml` dependencies; Cargo dependencies, path
   dependencies and `use` of a crate name.
   Each arrow shows how many references it sums. When several projects declare
   the same name (copies of a repository, forks, fixtures), the one closest to
   the referencing project wins: the longest shared folder path, ties by path.
5. **Nesting:** a view shows one level of projects; references from projects
   deeper inside are summed onto that level. Inside a project, its own files
   are one box.
6. **Folders without a marker:** one dashed box with their names and file counts
   by extension.
7. **Layout:** projects without arrows are laid out in rows of 3; a folder
   holding only one project is not drawn as a group; at most 20 arrows per
   view, largest first, with the hidden count in the title.

## The project view

1. **Own files:** a project's files, without the projects nested in it.
2. **Where it opens:** the project's single declared source root (`angular.json`
   or `project.json` `sourceRoot`, `composer.json` `autoload.psr-4`, Maven
   `sourceDirectory` or its standard layout, `pyproject.toml` `package-dir`,
   the Cargo crate root), unless a declared entry point lies outside it; else
   the project folder. A folder holding exactly one folder and no files is
   passed through.
3. **Boxes:** the folder's subfolders, and its code files (a language pack
   reads them), at most 12, entry points first; the rest are one "more files"
   box; other files are one dashed box; the project's marker files are one box.
4. **Entry points:** declared by project files (build targets' `main`,
   `browser` and `server`; `package.json` `main`, `module`, `bin`, `exports`;
   `composer.json` `bin`; `[project.scripts]`; Cargo targets), or marked by the
   language (`package main` with `func main`, `static Main` or top-level
   statements, `public static void main`, `fn main`, `if __name__ ==
   "__main__"`, `__main__.py`).
5. **Arrows:** imports between files, read and resolved by each ecosystem
   pack's code rule: by path (TypeScript relative imports and `tsconfig`
   aliases, Go import paths inside the module, Python modules, Rust `mod` and
   `use crate::`/`super::`/`self::`, PHP `require` of a literal path) or by
   declared namespace (C# `using`, PHP `use`, Java and Kotlin `import`: the
   longest declared namespace; a following name that matches a file picks
   that file). Imports of other projects come from the landscape's rules.
   Test files' imports are not drawn (per language pack) unless
   `classDiagram.includeTestFiles` is on. At most 20 arrows, largest first.
6. **Outside this folder:** a file or folder of the project outside the folder
   shown is one dashed box: the folder just below the closest folder above
   this one that holds it.

## Changing the examples

Run the tests with `UPDATE_GOLDENS=1` to accept new output after an intended
change, and review the changed files. On a mismatch the actual output is
written next to the expected file (`actual-*.mmd`, git-ignored).
