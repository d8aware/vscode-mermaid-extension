# Explorer examples answered by language extensions

**Explore Classes From Here** asks the installed language extension what is
around each type, one click at a time (TypeScript is also analysed by the
extension itself). These examples show the views it produces. They are also
tests: each language extension's answers were recorded once
(`<name>.views/answers.json`) and the tests replay them, so no language
server is needed to run them.

Every example is the same small orders model, so languages can be compared:
an `Order` with lines, money and a status; an `Entity` base it extends (Go has
no inheritance, Rust uses a trait); a `Store` interface; an in-memory
`MemStore` in another package that implements it; and a `Service` that uses
the store. Each `*.views/views.json` takes the same walks:

| View | Walk | Shows |
|---|---|---|
| `expected-1-order.mmd` | start at the order file | `Order`'s fields lead out to `Line`, `Money` and `Status`; `Entity` above it; `Service`, `Store` and `MemStore` use it |
| `expected-2-order-Store.mmd` | then light `Service` and `Store` | `MemStore` implements `Store`; `Service` holds a `Store` |
| `expected-3-store.mmd` | start at the store file, light `MemStore` | the implementation and its methods; `MemStore` holds orders |
| `expected-4-entity.mmd` (not Go) | start at the entity file | its subtype `Order` |

## Seven languages

| Language | Extension | Up / down from | Notes |
|---|---|---|---|
| [Go](go-orders.views/) | `golang.go` (gopls) | type hierarchy | Interfaces are implicit: the language server finds that `MemStore` satisfies `Store`. Methods `(*MemStore).Save` attach to `MemStore` (receivers). Map fields by rule 4's fallback |
| [C#](csharp-orders.views/) | `ms-dotnettools.csharp` | type hierarchy | Members arrive as `Name(params) : Type`; types inside namespace symbols |
| [PHP](php-orders.views/) | Intelephense (free) | declaration headers | No type hierarchy, implementations or go-to-type; parameters from child symbols |
| [TypeScript](ts-orders.views/) | built-in | declaration headers | Its "implementations" of a class include array literals, so declaration answers must land on a class name. Also rendered from our own analysis (below) |
| [Python](python-orders.views/) | Pylance | type hierarchy | Attributes (`self.lines`) are variables of the class; their range covers only the name, so field types come from the whole declaration line |
| [Java](java-orders.views/) | `redhat.java` | type hierarchy | Answers type hierarchy once the project has loaded |
| [Rust](rust-orders.views/) | rust-analyzer | blocks declared apart | No type hierarchy: `impl Store for MemStore` makes `MemStore` implement `Store`, and the methods in `impl` blocks join their type. Recorded with rust-analyzer directly |

### TypeScript: language extension compared with our own analysis

For TypeScript every walk is rendered three ways from the same code:

| File | Source |
|---|---|
| `expected-*.mmd` | The TypeScript language extension alone (as for other languages) |
| `expected-*.ours.mmd` | Our own analysis: what Explore Classes From Here shows for `.ts` files by default |
| `expected-*.ours-references.mmd` | Our analysis with "in" from every reference (`classDiagram.explorerConsumers: "references"`) |

- **Arrows** mostly agree. Every-reference "in" adds consumers through method
  parameters (`Service ..> Order`); our analysis counts only fields and
  constructor injection.
- **Members:** the language extension gives names only; ours shows types,
  visibility, parameters and `abstract`.
- **Unlit classes:** ours knows every class's fields up front, so
  `MemStore --> Order : orders` shows before `MemStore` is lit.
- **Ours with every reference** combines both: the extension's consumers with
  our members and field arrows.

## Rules

Each box and arrow comes from one of these, applied to the language
extension's answers (see `src/classDiagram/ProviderGraph.ts`; the language
specifics are pack data, see [language packs](../../docs/language-packs.md)):

1. **Boxes:** document symbols of kind class, struct, interface or enum (and
   other named types), looking inside namespace, package and module symbols.
   Members are the type's direct children of kind field, property, enum
   member, variable or constant, and its methods. Methods declared apart
   join their type, looked up across the folder: Go receivers `(T).M`, the
   methods of Rust `impl` blocks.
2. **Up:** supertypes from the type hierarchy. Without one: the definitions
   of the names in the type's declaration header (`class A extends B {`,
   `class A(B):`, `trait A: B {`), and the traits of blocks declared apart
   (`impl B for A`).
3. **Down:** subtypes, else implementations (an answer on an `impl` block
   counts as its type), plus rule 5's header references.
4. **Out:** the type definition of each field (enum values are not asked);
   where it finds no type in the workspace, the definitions of the names on
   the field's declaration line.
5. **In:** references; each one's consumer is the innermost type, method
   declared apart, or function around it. A reference in another type's
   declaration header or `impl … for` header makes that type a subtype
   instead. References outside any symbol (imports) are not drawn; at most 50
   files are resolved per type.
6. **Left out:** anything outside the workspace (standard library, module
   cache), in ignored folders, or in test files unless
   `classDiagram.includeTestFiles` is on.

Answers for up, down and out count only where they land on a type's name.

## Changing the examples

After changing an example or its `views.json`, record its answers again,
then accept the new views and review the diff.

- **Through VS Code** (any language): in the Extension Development Host (F5),
  open the example folder itself (so the extension loads it as a project),
  wait until hovering a type shows information, run **Mermaid (pack
  authors): Record Explorer Answers** and pick the example's `views.json`.
- **From a language server directly:**

  ```sh
  npm run compile
  node scripts/record-provider-answers.js test-files/explorer/go-orders.views          # gopls
  node scripts/record-provider-answers.js test-files/explorer/rust-orders.views -- rust-analyzer
  RECORD_ANSWERS=ts-orders xvfb-run -a npx vscode-test                                # TypeScript, in the test host
  ```

- **Accept:** `UPDATE_GOLDENS=1 xvfb-run -a npx vscode-test`.

Answers recorded through VS Code and directly from gopls were compared for
Go: identical apart from reference order and one error that VS Code reports
as an empty answer.
