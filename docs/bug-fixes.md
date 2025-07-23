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

The class diagram generator was using `p.getName()` to extract parameter names, but this method returned the full parameter text including default value assignments (e.g., `content = {}`, `useTextExtract = false`). Mermaid.js cannot parse these default value assignments in class diagram method signatures.

### Solution

Updated the parameter extraction logic in `GenerateClassDiagramCommand.generateClassDiagram()` to:

1. **Strip default values**: Use regex to remove default value assignments (`= value`)
2. **Flatten destructured parameters**: Convert `{ name, age }` to `name, age`
3. **Preserve parameter names and types**: Keep essential information while removing problematic syntax

**Implementation:**
```typescript
const params = methodParams.map(p => {
  // Get the parameter text (which may include default values)
  let paramText = p.getText();
  // Remove default value assignments (e.g., content = {})
  paramText = paramText.replace(/\s*=\s*[^,\)\]]+/g, '');
  // If destructured, flatten
  if (paramText.indexOf("{") > -1 && paramText.indexOf("}") > -1) {
    paramText = paramText.replace(/[{}]/g, '').trim();
  }
  // Only return the name part (and type if desired)
  return paramText.trim();
}).join(", ");
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
