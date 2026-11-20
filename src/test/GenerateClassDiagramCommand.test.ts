import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { GenerateClassDiagramCommand } from '../commands/GenerateClassDiagramCommand';

const EXAMPLE = path.resolve(__dirname, '../../test-files/class-diagram/domain-model');

function newCommand() {
  const progress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
  const token: vscode.CancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: () => { return {} as any; }
  };
  return new GenerateClassDiagramCommand(progress, token);
}

/** A scratch copy of the domain-model example, so tests can write into it. */
function copyExample(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'class-diagram-command-'));
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}

suite('GenerateClassDiagramCommand Tests', () => {
  const config = () => vscode.workspace.getConfiguration('vscode-mermaid-extension');
  const originalShowQuickPick = vscode.window.showQuickPick;
  let dir: string | undefined;

  teardown(async () => {
    (vscode.window as any).showQuickPick = originalShowQuickPick;
    await config().update('classDiagram.largeFolderThreshold', undefined, vscode.ConfigurationTarget.Global);
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
      dir = undefined;
    }
  });

  test('fromTypeScriptAtPath returns undefined for a folder that does not exist', async () => {
    assert.strictEqual(await newCommand().fromTypeScriptAtPath('/path/to/folder'), undefined);
  });

  test('a small folder is generated in full without asking', async () => {
    dir = copyExample();
    (vscode.window as any).showQuickPick = async () => assert.fail('should not ask for a small folder');
    const output = await newCommand().fromTypeScriptAtPath(dir);
    assert.strictEqual(output, path.join(dir, '.classes.mmd'));
    assert.strictEqual(fs.readFileSync(output!, 'utf8'), fs.readFileSync(path.join(EXAMPLE, 'expected.mmd'), 'utf8'));
  });

  test('a large folder asks for detail and grouping, and uses the answers', async () => {
    dir = copyExample();
    await config().update('classDiagram.largeFolderThreshold', 5, vscode.ConfigurationTarget.Global);
    const asked: string[] = [];
    (vscode.window as any).showQuickPick = async (items: any[], options: vscode.QuickPickOptions) => {
      asked.push(options.placeHolder!);
      return items.find((i) => i.label === 'Class names only' || i.label === 'Group by folder');
    };
    const output = await newCommand().fromTypeScriptAtPath(dir);
    assert.deepStrictEqual(asked, ['Which members should the diagram show?', 'Group classes by folder?']);
    assert.strictEqual(
      fs.readFileSync(output!, 'utf8'),
      fs.readFileSync(path.join(EXAMPLE, 'expected-grouped-names.mmd'), 'utf8')
    );
  });

  test('dismissing the picker writes nothing', async () => {
    dir = copyExample();
    await config().update('classDiagram.largeFolderThreshold', 5, vscode.ConfigurationTarget.Global);
    (vscode.window as any).showQuickPick = async () => undefined;
    assert.strictEqual(await newCommand().fromTypeScriptAtPath(dir), undefined);
    assert.ok(!fs.existsSync(path.join(dir, '.classes.mmd')));
  });

  test('a focused diagram is written next to the file', async () => {
    dir = copyExample();
    const output = await newCommand().fromTypeScriptFile(path.join(dir, 'domain', 'User.ts'));
    assert.strictEqual(output, path.join(dir, 'domain', 'User.classes.mmd'));
    assert.strictEqual(
      fs.readFileSync(output!, 'utf8'),
      fs.readFileSync(path.join(EXAMPLE, 'expected-focus-User.mmd'), 'utf8')
    );
  });
});
