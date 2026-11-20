import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { formatReport, probeDocument } from '../probe/languageProbe';

const FIXTURE = path.resolve(__dirname, '../../test-files/class-diagram/domain-model/domain/User.ts');

suite('Check Explorer Language Support', () => {
  test('probes a TypeScript file through the built-in TypeScript extension', async function () {
    this.timeout(120000);
    const document = await vscode.workspace.openTextDocument(FIXTURE);
    await vscode.window.showTextDocument(document);
    // The TypeScript server answers once it has loaded the project; retry until symbols appear.
    let result = await probeDocument(document);
    for (let i = 0; i < 20 && result.documentSymbols.status !== 'answered'; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await probeDocument(document);
    }
    const report = formatReport([result], [FIXTURE]);
    console.log(report);

    assert.strictEqual(result.languageId, 'typescript');
    assert.strictEqual(result.documentSymbols.status, 'answered');
    assert.ok(result.targets.some((t) => t.name === 'User'), 'User class probed');
    const user = result.targets.find((t) => t.name === 'User')!;
    const references = user.calls.find((c) => c.command === 'vscode.executeReferenceProvider')!;
    assert.strictEqual(references.status, 'answered');
    assert.match(report, /## .*User\.ts \(`typescript`\)/);
    assert.match(report, /Language pack: \*\*TypeScript\*\*/);
    assert.match(report, /\| in: consumers \| ✅ \|/);
    assert.match(report, /\| up: supertypes \| ↪ \|/, 'TypeScript has no type hierarchy: headers fill in');
  });
});
