import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { languageExtensions, vscodeProviders } from '../classDiagram/vscodeProviders';

/**
 * The live adapter: a fake language extension (providers registered for
 * `*.fakelang`) answers in each shape VS Code allows, and the adapter must turn
 * every one into the same plain answers the recordings hold.
 */
suite('vscodeProviders (a fake language extension)', () => {
  let dir: string;
  let file: string;
  let other: string;
  let hierarchy = true;
  const registrations: vscode.Disposable[] = [];
  const selector: vscode.DocumentSelector = { pattern: '**/*.fakelang' };
  const range = (l: number, c: number, l2: number, c2: number) => new vscode.Range(l, c, l2, c2);

  suiteSetup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-lang-'));
    file = path.join(dir, 'order.fakelang');
    other = path.join(dir, 'store.fakelang');
    fs.writeFileSync(file, 'class Order : Entity\n  store: Store\n  add()\n');
    fs.writeFileSync(other, 'interface Store\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), '');
    fs.mkdirSync(path.join(dir, 'sub'));
    const item = (name: string, at: string, r: vscode.Range) =>
      new vscode.TypeHierarchyItem(vscode.SymbolKind.Class, name, '', vscode.Uri.file(at), r, r);

    registrations.push(
      vscode.languages.registerDocumentSymbolProvider(selector, {
        provideDocumentSymbols: (doc) =>
          doc.fileName === file
            ? (() => {
                const order = new vscode.DocumentSymbol('Order', 'class', vscode.SymbolKind.Class, range(0, 0, 2, 7), range(0, 6, 0, 11));
                order.children = [
                  new vscode.DocumentSymbol('store', 'Store', vscode.SymbolKind.Field, range(1, 2, 1, 14), range(1, 2, 1, 7)),
                  new vscode.DocumentSymbol('add', '', vscode.SymbolKind.Method, range(2, 2, 2, 7), range(2, 2, 2, 5)),
                ];
                return [order];
              })()
            : // The older flat shape some extensions still return.
              [new vscode.SymbolInformation('Store', vscode.SymbolKind.Interface, '', new vscode.Location(doc.uri, range(0, 10, 0, 15)))],
      }),
      vscode.languages.registerTypeHierarchyProvider(selector, {
        prepareTypeHierarchy: (doc, pos) => (hierarchy && doc.fileName === file && pos.line === 0 ? item('Order', file, range(0, 6, 0, 11)) : undefined),
        provideTypeHierarchySupertypes: () => [item('Entity', other, range(0, 0, 0, 6))],
        provideTypeHierarchySubtypes: () => [],
      }),
      // Definition as a LocationLink (with and without a selection range); type definition as a Location.
      vscode.languages.registerDefinitionProvider(selector, {
        provideDefinition: () => [
          { targetUri: vscode.Uri.file(other), targetRange: range(0, 0, 0, 15), targetSelectionRange: range(0, 10, 0, 15) },
          { targetUri: vscode.Uri.file(other), targetRange: range(0, 0, 0, 15) },
        ],
      }),
      vscode.languages.registerTypeDefinitionProvider(selector, {
        provideTypeDefinition: () => new vscode.Location(vscode.Uri.file(other), range(0, 10, 0, 15)),
      }),
      vscode.languages.registerImplementationProvider(selector, {
        provideImplementation: () => [new vscode.Location(vscode.Uri.file(file), range(0, 6, 0, 11))],
      }),
      vscode.languages.registerReferenceProvider(selector, {
        provideReferences: () => [new vscode.Location(vscode.Uri.file(file), range(1, 9, 1, 14))],
      }),
    );
  });

  suiteTeardown(() => {
    registrations.forEach((r) => r.dispose());
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const p = vscodeProviders();
  const at = (line: number, character: number) => ({ line, character });

  test('document symbols: nested symbols with kind names and details; the flat shape too', async () => {
    const [order] = await p.documentSymbols(file);
    assert.strictEqual(order.name, 'Order');
    assert.strictEqual(order.kind, 'Class');
    assert.deepStrictEqual(order.selectionRange, { start: at(0, 6), end: at(0, 11) });
    assert.deepStrictEqual(order.children.map((c) => [c.name, c.kind, c.detail]), [['store', 'Field', 'Store'], ['add', 'Method', undefined]]);

    // VS Code may hand the flat shape on as either shape; the answer is the same.
    const [store] = await p.documentSymbols(other);
    assert.deepStrictEqual(
      { name: store.name, kind: store.kind, range: store.range, selectionRange: store.selectionRange, children: store.children, detail: store.detail },
      {
        name: 'Store',
        kind: 'Interface',
        range: { start: at(0, 10), end: at(0, 15) },
        selectionRange: { start: at(0, 10), end: at(0, 15) },
        children: [],
        detail: undefined,
      },
    );
  });

  test('type hierarchy: answers as locations; no hierarchy at all is undefined, not empty', async () => {
    assert.deepStrictEqual(await p.supertypes(file, at(0, 7)), [{ file: other, range: { start: at(0, 0), end: at(0, 6) } }]);
    assert.deepStrictEqual(await p.subtypes(file, at(0, 7)), []);
    assert.strictEqual(await p.supertypes(file, at(1, 3)), undefined, 'nothing to prepare at this position');
    hierarchy = false;
    try {
      assert.strictEqual(await p.subtypes(file, at(0, 7)), undefined, 'the extension has no type hierarchy');
    } finally {
      hierarchy = true;
    }
  });

  test('locations: links use their selection range, else their range; a single answer is a list', async () => {
    const store = { file: other, range: { start: at(0, 10), end: at(0, 15) } };
    assert.deepStrictEqual(await p.definition(file, at(1, 10)), [store, { file: other, range: { start: at(0, 0), end: at(0, 15) } }]);
    assert.deepStrictEqual(await p.typeDefinition(file, at(1, 10)), [store]);
    assert.deepStrictEqual(await p.implementations(other, at(0, 11)), [{ file, range: { start: at(0, 6), end: at(0, 11) } }]);
    assert.deepStrictEqual(await p.references(other, at(0, 11)), [{ file, range: { start: at(1, 9), end: at(1, 14) } }]);
  });

  test('text and siblings come from the disk; siblings are files only', async () => {
    assert.strictEqual(await p.text(other), 'interface Store\n');
    assert.deepStrictEqual((await p.siblings(file)).map((f) => path.basename(f)).sort(), ['notes.txt', 'order.fakelang', 'store.fakelang']);
    assert.deepStrictEqual(await p.siblings(path.join(dir, 'gone', 'x.fakelang')), [path.join(dir, 'gone', 'x.fakelang')]);
  });

  test('languageExtensions names the extensions that answer for a language', () => {
    assert.ok(languageExtensions('typescript').some((e) => e.startsWith('vscode.typescript-language-features ')), languageExtensions('typescript').join(', '));
    assert.deepStrictEqual(languageExtensions('no-such-language'), []);
  });
});
