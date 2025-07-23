# Bug Fixes

This document tracks significant bug fixes and their implementations in the VSCode Mermaid Extension.

## Default Parameter Bug Fix (Issue #24)

### Problem Description

When generating Mermaid class diagrams from TypeScript code, default parameter values in method signatures were being included in the Mermaid output, causing rendering errors.

**Problematic Input:**
```typescript
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
    schema?: T;
    content?: z.infer<T>;
    // ... other type definitions
  } = {}): Promise<z.infer<T>> {
    // method implementation
  }
}
```

**Mermaid Parse Error:**
```
Parse error on line 378:
...hema, content = {, llmClient,
----------------------^
Expecting 'STRUCT_STOP', 'MEMBER', got 'OPEN_IN_STRUCT'
```

### Root Cause

The class diagram generator was extracting parameter names from destructured parameters, but the regex pattern `\{\s*([^}]+)\s*\}` could not handle nested braces in default values like `content = {}`. This caused the extraction to stop at the first `}` found, resulting in incomplete parameter lists and malformed Mermaid syntax.

### Solution

Updated the parameter extraction logic in `GenerateClassDiagramCommand.generateClassDiagram()` to:

1. **Handle nested braces**: Use proper brace counting to find the complete destructured parameter list
2. **Strip default values**: Remove default value assignments (`= value`) from each parameter
3. **Preserve all parameter names**: Extract all parameters regardless of complex default values

**Implementation:**
```typescript
// Handle destructured parameters specially
if (paramText.includes('{') && paramText.includes('}')) {
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
    
    // Split by comma and clean each parameter
    const rawParams = destructuredContent.split(',');
    const individualParams = rawParams.map(param => {
      // Remove everything after the first = (default value)
      const nameOnly = param.split('=')[0].trim();
      return nameOnly;
    }).filter(param => param.length > 0);
    
    return individualParams.join(', ');
  }
}
```

### Expected Output

**Before Fix (caused parse error):**
```
+extract(instruction, schema, content = {}, llmClient, requestId, domSettleTimeoutMs, useTextExtract = false, selector): Promise<z.infer<T>>
```

**After Fix (valid Mermaid):**
```
+extract(instruction, schema, content, llmClient, requestId, domSettleTimeoutMs, useTextExtract, selector): Promise<z.infer<T>>
```

### Testing

Added comprehensive unit tests to prevent regression:

1. **Default parameter stripping test**: Verifies that `content = {}` and `useTextExtract = false` are removed
2. **Destructured parameter flattening test**: Confirms `{ name, age, birthdate }` becomes `name, age, birthdate`
3. **Complex user case test**: Uses the exact problematic code from the issue report

### Files Modified

- `src/commands/GenerateClassDiagramCommand.ts` - Updated parameter extraction logic
- `src/test/GenerateClassDiagramCommand.test.ts` - Added comprehensive test coverage

### Impact

This fix ensures that TypeScript methods with default parameters and destructured parameters generate valid Mermaid class diagrams that render correctly without parse errors.

## Extension Compatibility Fix (Issue #23)

### Problem Description

The VSCode Mermaid Extension was conflicting with other Mermaid-related extensions, particularly the Mermaid Markdown Syntax Highlighting extension. Users experienced issues where:

1. **Menu Command Conflicts**: Commands were not appearing in the correct context
2. **Language Association Issues**: Multiple extensions competing for `.mmd` file handling
3. **Activation Problems**: Extension activating unnecessarily when editing Mermaid files

### Root Cause

The extension was using:
- **Activation Event**: `onLanguage:mmd` which activated every time a Mermaid file was opened
- **Language Configuration**: Defining `.mmd` file associations that conflicted with other extensions
- **Menu Conditions**: Unnecessary `editorLangId` checks that prevented commands from appearing

### Solution

#### 1. Changed Activation Strategy
```json
// Before (package.json)
"activationEvents": [
  "onLanguage:mmd"
]

// After (package.json)
"activationEvents": [
  "onStartupFinished"
]
```

#### 2. Removed Language Configuration
```json
// Removed from package.json
"languages": [
  {
    "id": "mmd",
    "extensions": [".mmd"],
    "aliases": ["Mermaid", "mermaid"]
  }
]
```

#### 3. Streamlined Menu Conditions
```json
// Before
"when": "editorLangId == typescript && explorerResourceIsFolder"

// After  
"when": "explorerResourceIsFolder"
```

### Files Modified

- `package.json` - Updated activation events and removed language configuration
- Menu command conditions simplified for better compatibility

### Expected Behavior

**After Fix:**
1. **No Conflicts**: Extension coexists peacefully with other Mermaid extensions
2. **Proper Activation**: Only activates when needed, not on every Mermaid file open
3. **Consistent Commands**: Generate Class Diagram command appears reliably in folder context menus
4. **Better Performance**: Reduced unnecessary activations improve startup time

### Testing

- **Multi-extension Setup**: Verified compatibility with popular Mermaid extensions
- **Command Visibility**: Confirmed commands appear in appropriate contexts
- **Performance**: Validated reduced activation overhead

### Impact

This fix ensures the extension works harmoniously with other Mermaid-related extensions while maintaining full functionality for class diagram generation. 
