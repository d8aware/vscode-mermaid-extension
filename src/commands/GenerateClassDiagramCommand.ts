/* eslint-disable curly */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { Project, SourceFile, ClassDeclaration, InterfaceDeclaration, PropertyDeclaration, PropertySignature, MethodDeclaration, MethodSignature } from "ts-morph";
const importRegex = /import\("([^"]+)"\)\.(\w+)/;
const promiseRegex = /Promise<import\("([^"]+)"\)\.(\w+)>/;

interface Result {
  byFile: Record<string, Record<string, boolean>>;
  byType: Record<string, Record<string, boolean>>;
  output: string[];
}

type SourceRoot = {
  glob: string[];
  output: string;
};

class ImportProcessor {
  byFile: Record<string, Record<string, boolean>> = {};
  byType: Record<string, Record<string, boolean>> = {};
  output: string[] = [];

  processImportStrings(lines: string[]): Result {
    for (const line of lines) {
      const result = this.processImportString(line);
      this.mergeResult(result);
    }

    return { byFile: this.byFile, byType: this.byType, output: this.output };
  }

  hasImport(line: string): boolean {
    if ((promiseRegex.exec(line))) {
      return true;
    } else if ((importRegex.exec(line))) {
      return true;
    }
    return false;
  }

  processImportString(line: string): Result {
    const byFile: Record<string, Record<string, boolean>> = {};
    const byType: Record<string, Record<string, boolean>> = {};
    const output: string[] = [];

    let match;
    if ((match = promiseRegex.exec(line))) {
      const [_, path, type] = match;

      // Add to byFile dictionary
      if (!byFile[path]) byFile[path] = {};
      byFile[path][type] = true;

      // Add to byType dictionary
      if (!byType[type]) byType[type] = {};
      byType[type][path] = true;

      // Add to output
      output.push(`Promise<${type}>`);
    } else if ((match = importRegex.exec(line))) {
      const [_, path, type] = match;

      // Add to byFile dictionary
      if (!byFile[path]) byFile[path] = {};
      byFile[path][type] = true;

      // Add to byType dictionary
      if (!byType[type]) byType[type] = {};
      byType[type][path] = true;

      // Add to output
      output.push(type);
    } else {
      // No match, just add the line to the output as is
      output.push(line);
    }

    return { byFile, byType, output };
  }

  private mergeResult(result: Result): void {
    // Merge byFile
    for (const [path, types] of Object.entries(result.byFile)) {
      if (!this.byFile[path]) this.byFile[path] = {};
      Object.assign(this.byFile[path], types);
    }

    // Merge byType
    for (const [type, paths] of Object.entries(result.byType)) {
      if (!this.byType[type]) this.byType[type] = {};
      Object.assign(this.byType[type], paths);
    }

    // Merge output
    this.output.push(...result.output);
  }
}

export class GenerateClassDiagramCommand {

  progress: vscode.Progress<{ message?: string; increment?: number }>;
  token: vscode.CancellationToken;

  constructor(progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) {
    this.progress = progress;
    this.token = token;
  }

  importProcessor = new ImportProcessor();


  async fromTypeScriptAtPath(folderPath: string) {
    return new Promise(async (resolve, reject) => {

      let files = [];
      try {
        files = fs.readdirSync(folderPath);
      } catch (err) {
        vscode.window.showErrorMessage(`Error reading folder: ${err.message}`);
        resolve(false);
      }
  
      if (files.length === 0) {
        vscode.window.showInformationMessage("Folder is empty");
        resolve(false);
        return;
      }
  
      /**
       * Folder path might look like this:
       * /Users/username/Documents/Projects/MyProject
       * 
       * NOTE: This extension will skip over any files 
       * in `node_modules` folders, relative to the selected
       * folder path.
       */
      const sourceRoot = {
        glob: [
          `${folderPath}/**/*.ts`,
          `!${folderPath}/**/node_modules/**`
        ],
        output: path.join(folderPath, ".classes.mmd" )
      };
  
      const classDiagram = this.generateClassDiagram([sourceRoot]);
      console.log(classDiagram);
  
      await this.saveTextFile(classDiagram, sourceRoot.output);
      resolve(sourceRoot.output);

    });

  }

  processReturnTypeText(returnTypeText: string) {
    if (this.importProcessor.hasImport(returnTypeText)) {
      returnTypeText = this.importProcessor.processImportString(returnTypeText).output[0];
    }
    /**
     * If the returnTypeText is a literal type, like 
     * 
     * { foo: string, bar: number }
     * 
     * then set returnTypeText to "any"
     */
    if (returnTypeText.indexOf("{") > -1) {
      returnTypeText = "any";
    }
  
    return returnTypeText;
  }

  computeMethodReturnType(method: MethodDeclaration | MethodSignature) {
    const returnType = method.getReturnType();
    const returnTypeText = returnType.getText();
    return this.processReturnTypeText(returnTypeText);
  }
  
  computePropertyReturnType(prop: PropertyDeclaration | PropertySignature) {
    const returnType = prop.getType();
    const returnTypeText = returnType.getText();
    return this.processReturnTypeText(returnTypeText);
  }

  reportProgress(progress: number, message: string) {

  }

  generateClassDiagram(sourceGlobs: SourceRoot[]): string {
    const project = new Project();
    sourceGlobs.forEach(source => {
      project.addSourceFilesAtPaths(source.glob);
    });
  
    let diagram = "classDiagram\n";
  
    const classes: { [name: string]: ClassDeclaration } = {};
    const interfaces: { [name: string]: InterfaceDeclaration } = {};
    const sourceFilesAtPaths = project.getSourceFiles();
    sourceFilesAtPaths.forEach((sourceFile: SourceFile, i: number) => {

      sourceFile.getClasses().forEach((classDeclaration: ClassDeclaration) => {
  
        const className = classDeclaration.getName();
        if (className) {
          if (classes[className]) {
            classes[className] = classDeclaration;
          } else {
            classes[className] = classDeclaration;
          }
          diagram += `  class ${className} {\n`;
  
          /**
           * Add properties
           */
          classDeclaration.getProperties().forEach(prop => {
            const typeText = this.computePropertyReturnType(prop); //prop.getType().getText();
            if (classes[typeText] || interfaces[typeText]) {
              diagram += `    ${prop.getName()}: ${typeText}\n`;
            } else {
              diagram += `    ${prop.getName()}: ${typeText}\n`;
            }
          });
  
          /**
           * Add methods
           */
          classDeclaration.getMethods().forEach(method => {
            const methodName = method.getName();
            const methodParams = method.getParameters();
            const returnTypeText = this.computeMethodReturnType(method);
            const params = methodParams.map(p => {
              // Use getName() which gives us just the parameter name part without type annotations
              let paramText = p.getName();
              
              // Handle destructured parameters specially
              if (paramText.includes('{') && paramText.includes('}')) {
                // Extract just the parameter names from destructured syntax
                // Need to handle nested braces in default values like: { content = {}, other }
                
                // Find the matching closing brace using a stack-based approach
                let startIndex = paramText.indexOf('{');
                let endIndex = -1;
                const stack: number[] = [];
                
                for (let i = startIndex; i < paramText.length; i++) {
                  if (paramText[i] === '{') {
                    stack.push(i);
                  } else if (paramText[i] === '}') {
                    stack.pop();
                    if (stack.length === 0) {
                      endIndex = i;
                      break;
                    }
                  }
                }
                
                if (endIndex > startIndex) {
                  const destructuredContent = paramText.substring(startIndex + 1, endIndex);
                  
                  // Simple approach: split by comma first, then clean each parameter
                  const rawParams = destructuredContent.split(',');
                  const individualParams = rawParams.map(param => {
                    // Remove everything after the first = (default value)
                    const nameOnly = param.split('=')[0].trim();
                    return nameOnly;
                  }).filter(param => param.length > 0);
                  
                  return individualParams.join(', ');
                }
              }
              
              // For regular parameters, remove default value assignments
              paramText = paramText.replace(/\s*=\s*[^,\)\]]+/g, '');
              
              // Clean up whitespace and return
              return paramText.trim();
            }).join(", ");
            diagram += `    +${methodName}(${params}): ${returnTypeText}\n`;
          });
          diagram += "  }\n";
        }
      });
  
      sourceFile.getEnums().forEach(enumDeclaration => {
        const enumName = enumDeclaration.getName();
        if (enumName) {
          diagram += `  class ${enumName} {\n  <<enumeration>>\n`;
          enumDeclaration.getMembers().forEach(member => {
            diagram += `    ${member.getName()}\n`;
          });
          diagram += "  }\n";
        }
      });
  
      sourceFile.getInterfaces().forEach((interfaceDeclaration: InterfaceDeclaration) => {
        const interfaceName = interfaceDeclaration.getName();
        if (interfaceName) {
          interfaces[interfaceName] = interfaceDeclaration;
          diagram += `  class ${interfaceName} {\n  <<interface>>\n`;
  
          /**
           * Add properties
           */
          interfaceDeclaration.getProperties().forEach(prop => {
            const typeText = this.computePropertyReturnType(prop); //prop.getType().getText();
            if (classes[typeText] || interfaces[typeText]) {
              diagram += `    ${prop.getName()}: ${typeText}\n`;
            } else {
              diagram += `    ${prop.getName()}: ${typeText}\n`;
            }
          });
          
          interfaceDeclaration.getMethods().forEach(method => {
            const methodName = method.getName();
            const methodParams = method.getParameters();
            const returnTypeText = this.computeMethodReturnType(method);
            const params = methodParams.map(p => {
              return p.getName();
            }).join(", ");
            diagram += `    +${methodName}(${params}): ${returnTypeText}\n`;
          });
          diagram += "  }\n";
        }
      });

      this.progress.report({ increment: (i + 1) / sourceFilesAtPaths.length, message: sourceFile.getBaseName() });

    });
  
    Object.values(classes).forEach(classDeclaration => {
      const className = classDeclaration.getName();
      if (!className) return;
  
      const baseClass = classDeclaration.getBaseClass();
      if (baseClass) {
        diagram += `  ${baseClass.getName()} <|-- ${className}\n`;
      }
  
      classDeclaration.getImplements().forEach(impl => {
        const interfaceName = impl.getExpression().getText();
        diagram += `  ${interfaceName} <|.. ${className}\n`;
      });
  
      classDeclaration.getProperties().forEach(prop => {
        const typeText = prop.getType().getText();
        if (classes[typeText] || interfaces[typeText]) {
          diagram += `  ${className} --> ${typeText} : uses\n`;
        }
      });
    });
  
    Object.values(interfaces).forEach(interfaceDeclaration => {
      const interfaceName = interfaceDeclaration.getName();
      if (!interfaceName) return;
  
      interfaceDeclaration.getExtends().forEach(ext => {
        const extendedInterfaceName = ext.getExpression().getText();
        diagram += `  ${extendedInterfaceName} <|.. ${interfaceName}\n`;
      });
    });
  
    diagram += "\n";
    return diagram;
  }

  async saveTextFile(text: string, filePath: string) {
    return new Promise((resolve, reject) => {
      fs.writeFile(filePath, text, 'utf8', (err) => {
        if (err) {
          vscode.window.showErrorMessage(`Error writing file: ${err.message}`);
          resolve(true);
          return;
        }
        vscode.window.showInformationMessage(`File generated: ${filePath}`);
        resolve(true);
      });
    });
  }
}
