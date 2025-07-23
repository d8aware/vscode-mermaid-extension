# Publishing the Mermaid MMD Tools Extension

This document outlines the complete process for publishing a new version of the Mermaid MMD Tools extension to the VS Code Marketplace.

## Prerequisites

### 1. Install Visual Studio Code Extension Manager (vsce)
```bash
npm install -g @vscode/vsce
```

### 2. Verify Publisher Account
Ensure you have access to the `d8aware` publisher account on the [VS Code Marketplace](https://marketplace.visualstudio.com/manage/publishers/d8aware).

### 3. Authentication Token
You'll need a Personal Access Token (PAT) from Azure DevOps:
1. Go to [Azure DevOps](https://dev.azure.com)
2. Navigate to User Settings → Personal Access Tokens
3. Create a new token with **Marketplace (Manage)** scope
4. Store the token securely (you'll need it for publishing)

## Pre-Publishing Checklist

### 1. Code Quality and Testing
```bash
# Run linting
npm run lint

# Run tests
npm run test

# Build the extension
npm run build
```

### 2. Version Management
Update the version in `package.json`:
```json
{
  "version": "1.0.4"  // Increment according to semantic versioning
}
```

**Semantic Versioning Guidelines:**
- **Patch** (1.0.3 → 1.0.4): Bug fixes, minor improvements
- **Minor** (1.0.3 → 1.1.0): New features, backward compatible
- **Major** (1.0.3 → 2.0.0): Breaking changes

### 3. Update Documentation
- [ ] Update `CHANGELOG.md` with new features, fixes, and changes
- [ ] Review and update `README.md` if needed
- [ ] Ensure all documentation is current

### 4. Test Extension Locally
```bash
# Install the extension locally for testing
vsce package
code --install-extension vscode-mermaid-extension-1.0.4.vsix
```

## Publishing Process

### 1. Login to vsce (First Time Only)
```bash
vsce login d8aware
```
Enter your Personal Access Token when prompted.

### 2. Package the Extension
```bash
# Create a .vsix package file
vsce package
```

This will:
- Run the `vscode:prepublish` script automatically
- Create `vscode-mermaid-extension-1.0.4.vsix`

### 3. Publish to Marketplace
```bash
# Publish directly
vsce publish

# Or publish a specific package
vsce publish vscode-mermaid-extension-1.0.4.vsix
```

### 4. Alternative: Publish with Version Bump
```bash
# Automatically increment version and publish
vsce publish patch   # 1.0.3 → 1.0.4
vsce publish minor   # 1.0.3 → 1.1.0
vsce publish major   # 1.0.3 → 2.0.0
```

## Post-Publishing Verification

### 1. Marketplace Verification
1. Visit the [extension page](https://marketplace.visualstudio.com/items?itemName=d8aware.vscode-mermaid-extension)
2. Verify the new version is listed
3. Check that the description, screenshots, and metadata are correct

### 2. Installation Test
```bash
# Test installation from marketplace
code --install-extension d8aware.vscode-mermaid-extension
```

### 3. Functional Testing
- [ ] Test diagram viewing with `.mmd` files
- [ ] Test class diagram generation from TypeScript files
- [ ] Verify commands work from Command Palette
- [ ] Test context menu integration

## Git Repository Management

### 1. Tag the Release
```bash
git tag v1.0.4
git push origin v1.0.4
```

### 2. Create GitHub Release
1. Go to the [GitHub repository](https://github.com/d8aware/vscode-mermaid-extension)
2. Create a new release for the tag
3. Include changelog information
4. Attach the `.vsix` file if desired

## Troubleshooting

### Common Issues

#### 1. Authentication Errors
```bash
# If login fails, try re-logging
vsce logout
vsce login d8aware
```

#### 2. Package Validation Errors
- Ensure all required fields in `package.json` are filled
- Check that the `icon` file exists at the specified path
- Verify repository URL is accessible

#### 3. Build Failures
```bash
# Clean and rebuild
rm -rf out/ dist/ node_modules/
npm install
npm run build
```

#### 4. Version Conflicts
- Ensure the version in `package.json` is higher than the published version
- Check for any pre-release versions that might conflict

### Useful Commands

```bash
# Check current published version
vsce show d8aware.vscode-mermaid-extension

# List all files that will be included in package
vsce ls

# Show package information
vsce package --list

# Unpublish a version (use with caution)
vsce unpublish d8aware.vscode-mermaid-extension@1.0.4
```

## CI/CD Integration (Future Enhancement)

Consider setting up automated publishing using GitHub Actions:

```yaml
# .github/workflows/publish.yml
name: Publish Extension
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build
      - run: npx vsce publish -p ${{ secrets.VSCE_PAT }}
```

## Security Considerations

- Never commit Personal Access Tokens to the repository
- Store tokens in secure environment variables for CI/CD
- Regularly rotate access tokens
- Review extension permissions and required VS Code API access

## Support and Maintenance

After publishing:
- Monitor the marketplace for user feedback and ratings
- Respond to issues on the GitHub repository
- Plan regular updates based on VS Code API changes
- Consider user feature requests for future versions

---

**Quick Reference:**
```bash
# Complete publishing workflow
npm run lint && npm run test && npm run build
vsce package
vsce publish
git tag v1.0.4 && git push origin v1.0.4
``` 
