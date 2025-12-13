# Mermaid Preview Modes

The Mermaid MMD Tools extension supports two different preview modes to accommodate different workflows and preferences. This document explains both modes, when to use each, and how to configure them.

## Overview

The extension provides two ways to preview your Mermaid diagrams:

1. **Multi-Panel Mode** (Default) - Creates a new preview panel each time
2. **Single Preview Mode** (NEW) - Uses one reusable preview panel that updates automatically

## Multi-Panel Mode (Default)

### Behavior

In multi-panel mode, each time you click the "View Diagram" button, a new preview panel is created.

### When to Use

Multi-panel mode is ideal when you:
- Want to compare multiple diagrams side-by-side
- Have multiple monitors and want diagrams on different screens
- Prefer explicit control over which previews are open
- Work with a small number of diagrams simultaneously

### Example Workflow

```
1. Open diagram1.mmd → Click view button → Preview Panel 1 opens
2. Open diagram2.mmd → Click view button → Preview Panel 2 opens
3. Open diagram3.mmd → Click view button → Preview Panel 3 opens
Result: Three separate panels, each showing a different diagram
```

### Advantages

- ✅ View multiple diagrams simultaneously
- ✅ Compare diagrams side-by-side
- ✅ Explicit control over preview lifecycle
- ✅ Works great with multiple monitors

### Disadvantages

- ❌ Can clutter workspace with many panels
- ❌ Must manually manage and close panels
- ❌ Need to click button each time to preview

## Single Preview Mode (NEW)

### Behavior

In single preview mode, one preview panel is created and reused. The preview automatically updates to show whichever `.mmd` file you're currently viewing.

### When to Use

Single preview mode is ideal when you:
- Review many diagrams sequentially
- Want automatic preview updates like Markdown
- Prefer a clean, uncluttered workspace
- Work on a single monitor
- Navigate between many .mmd files frequently

### Example Workflow

```
1. Open diagram1.mmd → Click view button → Preview Panel opens showing diagram1
2. Switch to diagram2.mmd tab → Preview automatically updates to show diagram2
3. Switch to diagram3.mmd tab → Preview automatically updates to show diagram3
Result: One panel that follows your active .mmd file
```

### Advantages

- ✅ Automatic preview updates when switching files
- ✅ Clean workspace with only one preview panel
- ✅ Similar behavior to Markdown preview
- ✅ No need to repeatedly click view button
- ✅ Great for reviewing many diagrams

### Disadvantages

- ❌ Cannot view multiple diagrams simultaneously
- ❌ Preview follows active file (can't "pin" a diagram)

## Configuration

### Enable Single Preview Mode

**Via Settings UI:**

1. Open VS Code Settings: `File > Preferences > Settings` (or `Ctrl+,` / `Cmd+,`)
2. Search for: `Mermaid`
3. Check the box: **"Mermaid MMD Tools: Use Single Preview"**

**Via settings.json:**

Add this to your settings file:

```json
{
  "vscode-mermaid-extension.useSinglePreview": true
}
```

### Disable Single Preview Mode

To return to multi-panel mode:

1. Open VS Code Settings
2. Search for: `Mermaid`
3. Uncheck: **"Mermaid MMD Tools: Use Single Preview"**

Or set it to `false` in settings.json:

```json
{
  "vscode-mermaid-extension.useSinglePreview": false
}
```

## Behavior Details

### Triggering Preview Updates

In **Single Preview Mode**, the preview updates in two scenarios:

1. **Manual Trigger**: Click the "View Diagram" button in the editor title bar
   - Creates the preview if it doesn't exist
   - Brings focus to existing preview if it does

2. **Automatic Trigger**: Switch to a different `.mmd` file tab
   - Only happens if the preview panel is already open and visible
   - Preview updates to show the newly active diagram
   - Document change tracking switches to the new file

### Document Change Tracking

Both modes support live preview updates:

- When you edit a `.mmd` file, the preview updates automatically (debounced to 500ms)
- In single preview mode, tracking switches to whichever file is active
- Changes are reflected in real-time as you type

### Panel Lifecycle

**Multi-Panel Mode:**
- Each panel is independent
- Closing a panel only affects that panel
- No limit on number of panels (subject to VS Code limits)

**Single Preview Mode:**
- One shared panel is reused
- Closing the panel clears the shared state
- Next preview command creates a new shared panel
- Panel disposal properly cleans up event listeners

## Troubleshooting

### Preview Not Updating When Switching Files

**Issue**: In single preview mode, switching between .mmd files doesn't update the preview.

**Solutions**:
1. Verify single preview mode is enabled in settings
2. Make sure the preview panel is visible (not closed)
3. Check that you're switching to actual `.mmd` files
4. Try closing and reopening the preview

### Multiple Panels Still Opening

**Issue**: Multiple preview panels open even with single preview mode enabled.

**Solutions**:
1. Close all existing preview panels
2. Verify the setting is saved: check `settings.json`
3. Reload VS Code window: `Developer: Reload Window`
4. Check for conflicting extensions

### Preview Tracking Wrong File

**Issue**: Preview shows a different diagram than the active file.

**Solutions**:
1. Click the "View Diagram" button to resync
2. Close and reopen the preview
3. Verify the correct file is active in the editor

## Switching Between Modes

You can change between modes at any time:

1. **From Multi-Panel to Single Preview**:
   - Close any existing preview panels (optional but recommended)
   - Enable single preview mode in settings
   - Open a preview - now it will be in single mode

2. **From Single Preview to Multi-Panel**:
   - Disable single preview mode in settings
   - Existing preview remains open but won't auto-update
   - New previews will be in multi-panel mode

## Keyboard Shortcuts

Currently, there are no default keyboard shortcuts for the view command. You can add one:

1. Open Keyboard Shortcuts: `File > Preferences > Keyboard Shortcuts`
2. Search for: `View Diagram`
3. Click the `+` icon to add a keybinding
4. Suggested: `Ctrl+Shift+M` or `Cmd+Shift+M`

## Related Features

### Pan and Zoom

Both preview modes support pan and zoom:
- Use mouse wheel to zoom
- Click and drag to pan
- Zoom and pan state is preserved during live updates
- State resets when switching diagrams (single preview mode)
- Pan/zoom controls automatically adjust when panel is docked, moved, or resized

### Live Updates

Both modes support live diagram updates:
- Changes are debounced (500ms delay)
- Preview updates as you type
- Syntax errors are displayed in the preview

## Comparison Table

| Feature | Multi-Panel Mode | Single Preview Mode |
|---------|------------------|---------------------|
| Auto-update on file switch | ❌ No | ✅ Yes |
| Multiple diagrams visible | ✅ Yes | ❌ No |
| Manual preview creation | ✅ Yes | ✅ Yes |
| Click button for each preview | ✅ Required | ⚠️ Only first time |
| Workspace clutter | ⚠️ Can accumulate panels | ✅ One panel only |
| Side-by-side comparison | ✅ Yes | ❌ No |
| Similar to Markdown preview | ❌ No | ✅ Yes |
| Document change tracking | ✅ Per panel | ✅ Follows active file |

## Best Practices

### For Multi-Panel Mode Users

1. Explicitly close panels when done to avoid clutter
2. Use VS Code's panel management features
3. Consider window layouts for organizing multiple previews
4. Great for architecture review sessions

### For Single Preview Mode Users

1. Keep the preview panel open on one side of your screen
2. Navigate between .mmd files using tabs or file explorer
3. Preview automatically updates as you switch
4. Perfect for sequential diagram review or creation

## Feedback and Issues

If you encounter issues with either preview mode or have suggestions for improvements:

- [Report an issue on GitHub](https://github.com/d8aware/vscode-mermaid-extension/issues)
- Provide details about your configuration and the specific behavior
- Include your VS Code version and extension version

## Future Enhancements

Potential future improvements:

- Option to "pin" diagrams in single preview mode
- Keyboard shortcut to toggle between modes
- Preview mode indicator in status bar
- Split view option within single preview
- History navigation for single preview mode

---

**Related Documentation:**
- [Main README](../README.md)
- [Architecture Documentation](architecture.md)
- [Bug Fixes](bug-fixes.md)

