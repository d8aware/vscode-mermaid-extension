import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	mocha: {
		// The first ts-morph parse in a cold extension host can exceed mocha's 2s default.
		timeout: 10000,
	},
});
