import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { CodeExplorerCommand } from '../commands/CodeExplorerCommand';

const CLASSES = path.resolve(__dirname, '../../test-files/class-diagram/domain-model');
const LANDSCAPE = path.resolve(__dirname, '../../test-files/landscape/acme');

// The command keeps its state in statics; tests read it and drive it with the
// same messages the webview sends.
const explorer = CodeExplorerCommand as any;
const step = () => explorer.current();

suite('CodeExplorerCommand Tests', () => {
  let dir: string;
  const originalShowQuickPick = vscode.window.showQuickPick;

  setup(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-explorer-'));
  });

  teardown(() => {
    (vscode.window as any).showQuickPick = originalShowQuickPick;
    explorer.panel?.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test('explores classes from a file: click to light up, Back, Start over', async function () {
    this.timeout(60000);
    fs.cpSync(CLASSES, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreClasses', vscode.Uri.file(path.join(dir, 'shared', 'Money.ts')));

    assert.deepStrictEqual(step().origin, ['Currency', 'Money']);
    assert.deepStrictEqual([...explorer.session.view.frontier].sort(), ['OrderLine', 'User']);

    await explorer.onMessage({ command: 'nodeClick', id: 'User' });
    assert.deepStrictEqual(step().lit, ['Currency', 'Money', 'User']);
    assert.ok(explorer.session.view.frontier.has('Order'));

    await explorer.onMessage({ command: 'nodeClick', id: 'Order' });
    await explorer.onMessage({ command: 'back' });
    assert.deepStrictEqual(step().lit, ['Currency', 'Money', 'User']);

    await explorer.onMessage({ command: 'reset' });
    assert.deepStrictEqual(step().lit, ['Currency', 'Money']);
    await explorer.onMessage({ command: 'back' });
    assert.deepStrictEqual(step().lit, ['Currency', 'Money', 'User'], 'Start over can be undone');
  });

  test('each step says how it relates to the last: grown, deeper, higher; here and came from', async function () {
    this.timeout(60000);
    fs.cpSync(CLASSES, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreClasses', vscode.Uri.file(path.join(dir, 'shared', 'Money.ts')));
    const sent: any[] = [];
    const post = explorer.panel.webview.postMessage.bind(explorer.panel.webview);
    explorer.panel.webview.postMessage = (m: any) => {
      if (m.command === 'renderContent') {
        sent.push(m.transition);
      }
      return post(m);
    };
    await explorer.onMessage({ command: 'nodeClick', id: 'User' });
    await explorer.onMessage({ command: 'nodeClick', id: 'Order' });
    await explorer.onMessage({ command: 'back' });
    assert.deepStrictEqual(sent, [
      { kind: 'extend', level: 'Classes', focus: 'User', from: undefined },
      { kind: 'extend', level: 'Classes', focus: 'Order', from: 'User' },
      { kind: 'extend', level: 'Classes', focus: 'User', from: 'Order' },
    ]);
  });

  test('folder steps: deeper zooms in; going back marks the box you came from', async function () {
    this.timeout(60000);
    fs.cpSync(LANDSCAPE, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreFolder', vscode.Uri.file(dir));
    const sent: any[] = [];
    const post = explorer.panel.webview.postMessage.bind(explorer.panel.webview);
    explorer.panel.webview.postMessage = (m: any) => {
      if (m.command === 'renderContent') {
        sent.push(m.transition);
      }
      return post(m);
    };
    await explorer.onMessage({ command: 'nodeClick', id: 'p_platform' });
    await explorer.onMessage({ command: 'nodeClick', id: 'p_platform_libs_ui_kit' });
    await explorer.onMessage({ command: 'back' });
    await explorer.onMessage({ command: 'back' });
    assert.deepStrictEqual(sent, [
      { kind: 'descend', level: 'Projects' },
      { kind: 'descend', level: 'Code' },
      { kind: 'ascend', level: 'Projects', from: 'p_platform_libs_ui_kit' },
      { kind: 'ascend', level: 'Projects', from: 'p_platform' },
    ]);
  });

  test('clicking a lit class opens its source', async function () {
    this.timeout(60000);
    fs.cpSync(CLASSES, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreClasses', vscode.Uri.file(path.join(dir, 'shared', 'Money.ts')));
    await explorer.onMessage({ command: 'nodeClick', id: 'Money' });
    const editor = vscode.window.activeTextEditor;
    assert.ok(editor, 'an editor is open');
    assert.strictEqual(path.resolve(editor.document.fileName), path.resolve(dir, 'shared', 'Money.ts'));
    assert.strictEqual(editor.selection.active.line, 5, 'cursor on `export class Money`');
  });

  test('explores a folder: landscape, open a project, breadcrumb, Back', async function () {
    this.timeout(60000);
    fs.cpSync(LANDSCAPE, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreFolder', vscode.Uri.file(dir));

    assert.strictEqual(step().kind, 'landscape');
    assert.strictEqual(step().container, path.resolve(dir));
    const nodes: Map<string, any> = explorer.session.view.nodes;
    assert.ok(nodes.has('p_platform') && nodes.has('plain'));

    await explorer.onMessage({ command: 'nodeClick', id: 'p_platform' });
    assert.strictEqual(step().container, path.join(dir, 'platform'));
    assert.deepStrictEqual(explorer.crumbs(step()).map((c: any) => c.label), [path.basename(dir), 'platform']);

    await explorer.onMessage({ command: 'crumb', index: 0 });
    assert.strictEqual(step().container, path.resolve(dir), 'breadcrumb goes back up');
    await explorer.onMessage({ command: 'back' });
    assert.strictEqual(step().container, path.join(dir, 'platform'), 'and Back undoes it');
  });

  test('from a project in the landscape into its classes', async function () {
    this.timeout(60000);
    fs.cpSync(LANDSCAPE, dir, { recursive: true });
    await vscode.commands.executeCommand('vscode-mermaid-extension.exploreFolder', vscode.Uri.file(dir));
    await explorer.onMessage({ command: 'nodeClick', id: 'p_platform' });

    // ui-kit has no projects inside it: clicking shows its code, a folder at a time, then a file's classes.
    await explorer.onMessage({ command: 'nodeClick', id: 'p_platform_libs_ui_kit' });
    assert.strictEqual(step().kind, 'project');
    assert.ok(explorer.session.view.mermaid.includes('n_src["<small>FOLDER</small><br/><b>src/</b>'), explorer.session.view.mermaid);
    assert.ok(explorer.session.view.mermaid.includes('n_src -- "1" --> pj_platform_libs_util'), 'imports of another project');
    await explorer.onMessage({ command: 'nodeClick', id: 'n_src' });
    assert.strictEqual(step().folder, path.join(dir, 'platform', 'libs', 'ui-kit', 'src'));
    assert.deepStrictEqual(explorer.crumbs(step()).map((c: any) => c.label), [path.basename(dir), 'platform', 'ui-kit', 'src']);
    await explorer.onMessage({ command: 'nodeClick', id: 'n_src_index_ts' });
    assert.strictEqual(step().kind, 'classes');
    assert.deepStrictEqual(step().origin, ['Button']);
    assert.deepStrictEqual(explorer.crumbs(step()).map((c: any) => c.label), [path.basename(dir), 'platform', 'ui-kit', 'index.ts']);

    // The breadcrumb's project opens its code view again.
    await explorer.onMessage({ command: 'crumb', index: 2 });
    assert.strictEqual(step().kind, 'project');
    await explorer.onMessage({ command: 'back' });
    await explorer.onMessage({ command: 'back' });
    await explorer.onMessage({ command: 'back' });
    await explorer.onMessage({ command: 'back' });
    assert.strictEqual(step().kind, 'landscape', 'Back returns to the landscape');
  });
});
