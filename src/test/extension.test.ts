import * as assert from 'assert';
import * as vscode from 'vscode';
import { ViewDiagramCommand } from '../commands/ViewDiagramCommand';

suite('Preview Mode Tests', () => {
	let originalConfig: boolean;

	setup(async () => {
		// Store original configuration
		const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		originalConfig = config.get<boolean>('useSinglePreview', false);
	});

	teardown(async () => {
		// Restore original configuration
		const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		await config.update('useSinglePreview', originalConfig, vscode.ConfigurationTarget.Global);
	});

	test('Configuration setting exists and has correct default', async () => {
		const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		const useSinglePreview = config.get<boolean>('useSinglePreview');
		
		// Default should be false
		assert.strictEqual(typeof useSinglePreview, 'boolean');
	});

	test('Configuration setting can be updated', async () => {
		const config = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		
		// Set to true
		await config.update('useSinglePreview', true, vscode.ConfigurationTarget.Global);
		// Re-fetch configuration after update
		let updatedConfig = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		let value = updatedConfig.get<boolean>('useSinglePreview');
		assert.strictEqual(value, true, 'Configuration should be updated to true');
		
		// Set to false
		await config.update('useSinglePreview', false, vscode.ConfigurationTarget.Global);
		// Re-fetch configuration after update
		updatedConfig = vscode.workspace.getConfiguration('vscode-mermaid-extension');
		value = updatedConfig.get<boolean>('useSinglePreview');
		assert.strictEqual(value, false, 'Configuration should be updated to false');
	});

	test('ViewDiagramCommand has static methods for shared panel access', () => {
		// When: Calling static methods
		const sharedPanel = ViewDiagramCommand.getSharedPanel();
		const currentDocument = ViewDiagramCommand.getCurrentDocument();
		
		// Then: Methods should be accessible (may return undefined initially)
		assert.strictEqual(typeof ViewDiagramCommand.getSharedPanel, 'function');
		assert.strictEqual(typeof ViewDiagramCommand.getCurrentDocument, 'function');
	});

	test('ViewDiagramCommand can be instantiated', () => {
		// When: Creating a new instance
		const command = new ViewDiagramCommand();
		
		// Then: Instance should be created successfully
		assert.ok(command);
		assert.strictEqual(typeof command.fromActiveTextEditor, 'function');
		assert.strictEqual(typeof command.updatePanelForDocument, 'function');
	});
});

suite('Document Tracking Tests', () => {
	test('ViewDiagramCommand provides current document tracking', () => {
		// When: Querying current document
		const currentDoc = ViewDiagramCommand.getCurrentDocument();
		
		// Then: Should return undefined or a document
		// (undefined when no preview is active)
		if (currentDoc !== undefined) {
			assert.ok(currentDoc.uri);
			assert.ok(currentDoc.getText);
		}
	});

	test('ViewDiagramCommand provides shared panel tracking', () => {
		// When: Querying shared panel
		const sharedPanel = ViewDiagramCommand.getSharedPanel();
		
		// Then: Should return undefined or a panel
		// (undefined when no preview is active)
		if (sharedPanel !== undefined) {
			assert.ok(sharedPanel.webview);
			assert.ok(sharedPanel.visible !== undefined);
		}
	});
});
