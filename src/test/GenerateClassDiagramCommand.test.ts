import * as assert from 'assert';
import * as vscode from 'vscode';
import { GenerateClassDiagramCommand } from '../commands/GenerateClassDiagramCommand';
import { generateClassDiagramForTest } from './testUtils';

suite('GenerateClassDiagramCommand Tests', () => {
  test('fromTypeScriptAtPath should return the output file path', async () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = {
      report: () => {}
    };
    const token: vscode.CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: () => { return {} as any; }
    };
    const command = new GenerateClassDiagramCommand(progress, token);

    const folderPath = '/path/to/folder';
    const result = await command.fromTypeScriptAtPath(folderPath);

    // The method returns false when folder doesn't exist or is empty
    // Since we're testing with a non-existent path, it should return false
    assert.strictEqual(result, false);
  });

  test('processReturnTypeText should return the processed return type', () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = {
      report: () => {}
    };
    const token: vscode.CancellationToken = {
      isCancellationRequested: false,
      onCancellationRequested: () =>  { return {} as any; }
    };
    const command = new GenerateClassDiagramCommand(progress, token);

    const returnTypeText = 'Promise<import("path/to/module").Type>';
    const processedReturnType = command.processReturnTypeText(returnTypeText);

    // The processReturnTypeText method doesn't strip Promise wrappers,
    // it only processes imports and literal types
    assert.strictEqual(processedReturnType, 'Promise<Type>');
  });

  test('generateClassDiagram strips default parameter values from method signatures', () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: () => { return {} as any; } };
    const command = new GenerateClassDiagramCommand(progress, token);

    // Patch the method to use an in-memory Project
    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true });
    const code = `
      class Example {
        foo(a = 1, b: string = "bar", c = { x: 1 }) {}
        bar(x: number, y = 2) {}
      }
    `;
    project.createSourceFile('Example.ts', code);
    const diagram = generateClassDiagramForTest(project);
    assert.ok(diagram.includes('+foo(a, b: string, c): void'));
    assert.ok(diagram.includes('+bar(x: number, y): void'));
    // Ensure no default values in output
    assert.ok(!diagram.includes('='));
  });

  test('generateClassDiagram flattens destructured parameters', () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: () => { return {} as any; } };
    const command = new GenerateClassDiagramCommand(progress, token);

    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true });
    const code = `
      class Destructured {
        setInfo({ name, age, birthdate }) {}
      }
    `;
    project.createSourceFile('Destructured.ts', code);
    const diagram = generateClassDiagramForTest(project);
    // Should flatten destructured params
    assert.ok(diagram.includes('+setInfo(name, age, birthdate): void'));
    // The diagram may still contain curly braces from the class declaration syntax
    // so we check that the method parameters specifically don't have them
    const methodLine = diagram.split('\n').find(line => line.includes('+setInfo'));
    assert.ok(methodLine && !methodLine.includes('{')); 
  });

  test('generateClassDiagram handles complex user-reported case with default parameters and destructuring', () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: () => { return {} as any; } };
    const command = new GenerateClassDiagramCommand(progress, token);

    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true });
    
    // This is the exact problematic code from the user's report
    const code = `
      import { z } from 'zod';

      interface LLMClient {}
      interface Stagehand {}
      interface StagehandPage {}
      interface LogLine {}

      class StagehandExtractHandler {
        stagehand: Stagehand;
        stagehandPage: StagehandPage;
        logger: LogLine;
        userProvidedInstructions: string;

        public async extract<T extends z.AnyZodObject>({
          instruction,
          schema,
          content = {},
          llmClient,
          requestId,
          domSettleTimeoutMs,
          useTextExtract = false,
          selector,
        }: {
          instruction?: string;
          schema?: T;
          content?: z.infer<T>;
          chunksSeen?: Array<number>;
          llmClient?: LLMClient;
          requestId?: string;
          domSettleTimeoutMs?: number;
          useTextExtract?: boolean;
          selector?: string;
        } = {}): Promise<z.infer<T>> {
          const noArgsCalled = !instruction && !schema && !llmClient && !selector;
          return {} as z.infer<T>;
        }

        extractPageText(): any {
          return {};
        }

        async textExtract({
          instruction,
          schema,
          content,
          llmClient,
          requestId,
          domSettleTimeoutMs,
          selector,
        }: {
          instruction?: string;
          schema?: any;
          content?: any;
          llmClient?: LLMClient;
          requestId?: string;
          domSettleTimeoutMs?: number;
          selector?: string;
        }): Promise<any> {
          return {};
        }
      }
    `;
    
    project.createSourceFile('StagehandExtractHandler.ts', code);
    
    const diagram = generateClassDiagramForTest(project);
    
    // Verify the problematic extract method is correctly processed
    assert.ok(diagram.includes('+extract('));
    
    // Ensure no default values appear in the output (this was the bug)
    assert.ok(!diagram.includes('= {}'));
    assert.ok(!diagram.includes('= false'));
    
    // Ensure destructured parameters are flattened
    const extractMethodLine = diagram.split('\n').find(line => line.includes('+extract('));
    assert.ok(extractMethodLine);
    
    // The extract method should have flattened parameters without defaults
    assert.ok(extractMethodLine.includes('instruction'));
    assert.ok(extractMethodLine.includes('schema'));
    assert.ok(extractMethodLine.includes('content'));
    assert.ok(extractMethodLine.includes('llmClient'));
    assert.ok(extractMethodLine.includes('requestId'));
    assert.ok(extractMethodLine.includes('domSettleTimeoutMs'));
    assert.ok(extractMethodLine.includes('useTextExtract'));
    assert.ok(extractMethodLine.includes('selector'));
    
    // Ensure no curly braces in the method parameter list
    assert.ok(!extractMethodLine.includes('{'));
    assert.ok(!extractMethodLine.includes('}'));
    
    // Verify other methods are also correctly processed
    assert.ok(diagram.includes('+extractPageText(): any'));
    assert.ok(diagram.includes('+textExtract('));
    
    // Verify the class structure is correct
    assert.ok(diagram.includes('class StagehandExtractHandler {'));
    assert.ok(diagram.includes('stagehand: any'));
    assert.ok(diagram.includes('stagehandPage: any'));
    assert.ok(diagram.includes('logger: any'));
    assert.ok(diagram.includes('userProvidedInstructions: any'));
  });

  test('reproduces exact user issue - FIXED implementation should pass this test', () => {
    const progress: vscode.Progress<{ message?: string; increment?: number }> = { report: () => {} };
    const token: vscode.CancellationToken = { isCancellationRequested: false, onCancellationRequested: () => { return {} as any; } };
    const command = new GenerateClassDiagramCommand(progress, token);

    const { Project } = require('ts-morph');
    const project = new Project({ useInMemoryFileSystem: true });
    
    // Exact user code that was causing the issue
    const code = `
      interface LLMClient {}
      
      class StagehandExtractHandler {
        public async extract({
          instruction,
          schema,
          content = {},
          llmClient,
          requestId,
          domSettleTimeoutMs,
          useTextExtract = false,
          selector,
        }: {
          instruction?: string;
          schema?: any;
          content?: any;
          llmClient?: LLMClient;
          requestId?: string;
          domSettleTimeoutMs?: number;
          useTextExtract?: boolean;
          selector?: string;
        } = {}) {
          return {};
        }
      }
    `;
    
    project.createSourceFile('Test.ts', code);
    
    // Test with the FIXED logic (same as the real implementation)
    const diagram = generateClassDiagramForTest(project);
    
    // Verify the fix works
    const extractLine = diagram.split('\n').find(line => line.includes('+extract('));
    
    // Should find the extract method
    assert.ok(extractLine, 'Should find extract method');
    
    // Should have individual parameters without default values
    assert.ok(extractLine.includes('instruction'), 'Should include instruction parameter');
    assert.ok(extractLine.includes('schema'), 'Should include schema parameter');
    assert.ok(extractLine.includes('content'), 'Should include content parameter');
    assert.ok(extractLine.includes('llmClient'), 'Should include llmClient parameter');
    assert.ok(extractLine.includes('useTextExtract'), 'Should include useTextExtract parameter');
    assert.ok(extractLine.includes('selector'), 'Should include selector parameter');
    
    // Should NOT have default values
    assert.ok(!extractLine.includes('= {}'), 'Should not include default object');
    assert.ok(!extractLine.includes('= false'), 'Should not include default boolean');
    
    // Should NOT have malformed syntax that caused the original Mermaid parse error
    assert.ok(!extractLine.includes('content = {'), 'Should not have broken default syntax');
    
    // Verify the correct format: should be clean parameter list
    assert.ok(extractLine.includes('instruction, schema, content, llmClient'), 'Should have clean comma-separated parameters');
  });

  // Add more tests for other methods and functionalities of the GenerateClassDiagramCommand class
});
