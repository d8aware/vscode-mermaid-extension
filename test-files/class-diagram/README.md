# Class diagram examples

Each folder here is a small TypeScript project together with the class diagram
the extension generates from it. They are a gallery of what **Generate Class
Diagram** does, and they are also the golden tests: the test suite regenerates
every example and fails if the output no longer matches.

## Exploring the examples

- **See the result:** open a folder's `expected.mmd` and click **View Diagram**
  (top right of the editor).
- **Compare with the source:** the `.ts` files in the same folder are the input.
  Each example's main file starts with a comment describing what it demonstrates.
- **Generate it yourself:** right-click an example folder in the Explorer and
  choose **Generate Class Diagram**. It writes `.classes.mmd` into the folder
  (git-ignored) and opens the preview.

| Example | What it shows |
|---|---|
| [domain-model](domain-model/expected.mmd) | An overview: a small domain model using most features together. Also shown in every view (below) |
| [relationships](relationships/expected.mmd) | Fields that reference other classes become labelled arrows, through arrays, `Map<…>`, `Promise<…>`, unions, self-references and tsconfig path aliases |
| [members](members/expected.mmd) | Visibility markers (`+` `-` `#`), static (underlined), abstract (italic), getters/setters, optional fields, parameter lists, and how types are formatted |
| [inheritance](inheritance/expected.mmd) | `extends` (solid arrow) and `implements` (dotted arrow) for classes and interfaces; a base class from outside the folder |
| [dependency-injection](dependency-injection/expected.mmd) | Constructor injection: parameter properties as fields, plain constructor parameters as dashed dependency arrows |
| [naming](naming/expected.mmd) | Same-named classes kept apart, generic classes, namespaces, enums, object-shaped `type` aliases, `.tsx` files |
| [file-selection](file-selection/expected.mmd) | Which files are read: test files, `.d.ts` and `node_modules` are skipped; [expected-with-tests.mmd](file-selection/expected-with-tests.mmd) shows the `classDiagram.includeTestFiles` setting turned on |

## Views of the same model

The `domain-model` example is also generated in each view the extension offers,
so you can compare them side by side:

| View | How you get it in the editor |
|---|---|
| [All members](domain-model/expected.mmd) | The default for folders with up to 40 classes |
| [Public members only](domain-model/expected-public.mmd) | Picked for a large folder (the default choice), or `classDiagram.detail: "public"` |
| [Class names only](domain-model/expected-names.mmd) | Picked for a large folder, or `classDiagram.detail: "names"` |
| [Grouped by folder](domain-model/expected-grouped.mmd) | Picked for a large folder spanning several folders, or `classDiagram.groupByFolder: "always"` |
| [Grouped, names only](domain-model/expected-grouped-names.mmd) | Both of the above |
| [Focused on `domain/User.ts`](domain-model/expected-focus-User.mmd) | Right-click `User.ts` → **Generate Focused Class Diagram** |
| [Focused on `shared/Money.ts`](domain-model/expected-focus-Money.mmd) | Right-click `Money.ts` → **Generate Focused Class Diagram** |

### Exploring from a file

**Explore Classes From Here** (right-click a TypeScript file) opens an
interactive panel instead of writing a file. You start with the file's classes
lit; the classes one step away in any direction (supertypes, subtypes, the
classes they use, and their consumers) are dashed boxes you click to light up.
These three files are a walk through `domain-model`, one click per step:

| Step | View |
|---|---|
| 1. Start in `shared/Money.ts` | [expected-explore-1-Money.mmd](domain-model/expected-explore-1-Money.mmd) |
| 2. Click `User` | [expected-explore-2-Money-User.mmd](domain-model/expected-explore-2-Money-User.mmd) |
| 3. Click `Order` | [expected-explore-3-Money-User-Order.mmd](domain-model/expected-explore-3-Money-User-Order.mmd) |

A focused diagram shows the classes declared in that file (outlined in red,
with all members) plus every class that has an arrow to or from them, with
public members only. It works the same in a project of any size.

## Arrow key

| Arrow | Meaning |
|---|---|
| `A <\|-- B` (solid, hollow head) | B extends A |
| `A <\|.. B` (dotted, hollow head) | B implements A |
| `A --> B : field` | A has a field (or getter) of type B |
| `A ..> B` (dashed) | A's constructor takes a B without storing it as a field |

## Changing or adding examples

- **Add an example:** create a folder with `.ts` files and a `tsconfig.json`,
  then run the tests with `UPDATE_GOLDENS=1` to write its `expected.mmd`. Review
  the new file before committing it.
- **Add a view of an example:** list it in the example's `golden.json`, e.g.
  `{ "variants": { "expected-public.mmd": { "detail": "public" } } }`. Options:
  `detail` (`"full"`, `"public"`, `"names"`), `groupByFolder` (`true`), `focus`
  (a file path relative to the example), `includeTestFiles` (`true`), and
  `explore` (a start file) with `clicks` (class ids, in order) for an explorer
  view. Variant file names must start with `expected`.
- **When a test fails:** the actual output is written next to the expected file
  (`expected-x.mmd` → `actual-x.mmd`, git-ignored). Diff the two, or preview it.
- **After an intended change to the generator:** run
  `UPDATE_GOLDENS=1 xvfb-run -a npm test` (or without `xvfb-run` on a desktop)
  and review the changed `expected.mmd` files in the diff.
