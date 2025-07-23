import { Project } from 'ts-morph';

/**
 * Generates a Mermaid class diagram string from a ts-morph Project instance.
 * Handles properties, methods, destructured parameters, default values, and type handling.
 * Used for testing class diagram generation logic.
 */
export function generateClassDiagramForTest(project: Project): string {
  let diagram = 'classDiagram\n';
  const sourceFiles = project.getSourceFiles();
  sourceFiles.forEach(sourceFile => {
    sourceFile.getClasses().forEach(classDeclaration => {
      const className = classDeclaration.getName();
      diagram += `  class ${className} {\n`;

      // Add properties (if any)
      if (typeof classDeclaration.getProperties === 'function') {
        classDeclaration.getProperties().forEach(prop => {
          diagram += `    ${prop.getName()}: any\n`;
        });
      }

      // Add methods
      classDeclaration.getMethods().forEach(method => {
        const methodName = method.getName();
        const methodParams = method.getParameters();
        const params = methodParams.map(p => {
          // Get the full parameter text
          let paramText = p.getText();

          // Handle destructured parameters specially (must start with { to be destructuring)
          if (paramText.trim().startsWith('{') && paramText.includes('}')) {
            // Extract just the parameter names from destructured syntax
            // Find the matching closing brace by counting brace depth
            let braceDepth = 0;
            let startIndex = paramText.indexOf('{');
            let endIndex = -1;
            for (let i = startIndex; i < paramText.length; i++) {
              if (paramText[i] === '{') {
                braceDepth++;
              } else if (paramText[i] === '}') {
                braceDepth--;
                if (braceDepth === 0) {
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

          // For regular parameters, remove default value assignments but keep type annotations
          // Remove everything after = (default values) but before removing, preserve type info
          if (paramText.includes('=')) {
            // Find the = and remove everything after it
            const equalIndex = paramText.indexOf('=');
            paramText = paramText.substring(0, equalIndex).trim();
          }
          
          return paramText.trim();
        }).join(', ');
        // Compute actual return type
        const returnType = method.getReturnType();
        let returnTypeText = returnType.getText();
        
        // Simple processing for test - just handle basic import cases
        if (returnTypeText.includes('import(')) {
          returnTypeText = returnTypeText.replace(/import\("([^"]+)"\)\.(\w+)/g, '$2');
        }
        if (returnTypeText.indexOf("{") > -1) {
          returnTypeText = "any";
        }
        
        diagram += `    +${methodName}(${params}): ${returnTypeText}\n`;
      });
      diagram += '  }\n';
    });
  });
  return diagram;
} 
