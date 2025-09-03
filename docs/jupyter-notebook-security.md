# Jupyter Notebook Security Features

## Overview

Roo Code includes comprehensive security features for working with Jupyter notebooks (`.ipynb` files). These features protect against potentially dangerous code execution, cross-site scripting (XSS) attacks, and other security risks commonly associated with Jupyter notebooks.

## Security Validation

### Automatic Risk Detection

When opening or editing Jupyter notebooks, Roo Code automatically scans for:

#### Critical Risks (Blocks Editing)

- **Code Execution**: `eval()`, `exec()`, `compile()`, `__import__()`
- **Shell Commands**: `!command`, `%system`, `%%bash`, `%%sh`, `%%script`

#### High Risks (Blocks Editing)

- **Dangerous Imports**: `subprocess`, `os`, `sys`, `socket`, `pickle`
- **Script Injection**: `<script>` tags in markdown cells
- **IFrame Injection**: `<iframe>` tags in markdown cells
- **JavaScript Protocol**: `javascript:` URLs in markdown
- **JavaScript Outputs**: Cells with `application/javascript` output

#### Medium Risks (Warnings Only)

- **File Operations**: `open()`, `file()`, `.read()`, `.write()`
- **Network Operations**: `requests`, `urllib`, `http.client`
- **Event Handlers**: `onclick`, `onload`, etc. in markdown
- **Oversized Cells**: Cells exceeding 1MB
- **Excessive Cell Count**: Notebooks with >1000 cells

#### Low Risks (Informational)

- **Suspicious Metadata**: Presence of `widgets`, `extensions`, or `jupyter_dashboards` fields

### Read-Only Mode

Notebooks containing critical or high-severity risks automatically open in read-only mode, preventing:

- Cell modifications
- Cell additions or deletions
- Saving changes to disk

## YOLO Mode (You Only Live Once)

For trusted environments where you need to work with notebooks containing "unsafe" constructs, YOLO Mode allows you to bypass all security restrictions.

### Enabling YOLO Mode

Add the following to your VSCode settings:

```json
{
	"roo-code.jupyterNotebookYoloMode": true
}
```

Or use the command palette:

1. Press `Cmd/Ctrl + Shift + P`
2. Search for "Preferences: Open Settings (JSON)"
3. Add the setting above

### What YOLO Mode Does

When enabled, YOLO Mode:

- ✅ Bypasses all security validation
- ✅ Allows editing of any notebook content
- ✅ Permits execution of shell commands
- ✅ Allows dangerous imports and operations
- ✅ Enables saving of modified notebooks

### ⚠️ YOLO Mode Warnings

**USE WITH EXTREME CAUTION**: YOLO Mode completely disables security protections. Only enable it when:

- Working with trusted notebooks from known sources
- In isolated/sandboxed environments
- You fully understand the risks involved
- The notebook requires system-level operations for legitimate purposes

## Security Configuration

### Advanced Configuration Options

```typescript
interface JupyterSecurityConfig {
	// Enable YOLO Mode (bypass all security)
	yoloMode?: boolean

	// Allow code execution (default: false)
	allowCodeExecution?: boolean

	// Force read-only mode (default: true)
	readOnlyMode?: boolean

	// Maximum cell size in bytes (default: 1MB)
	maxCellSize?: number

	// Maximum number of cells (default: 1000)
	maxCellCount?: number

	// Trusted source paths (notebooks from these paths bypass security)
	trustedSources?: string[]
}
```

### Trusted Sources

You can configure specific directories as trusted sources. Notebooks from these locations will bypass security checks:

```json
{
	"roo-code.jupyterTrustedSources": ["/home/user/trusted-notebooks", "/projects/data-science/verified"]
}
```

## Automatic Sanitization

When security risks are detected and YOLO Mode is disabled, Roo Code automatically sanitizes dangerous content:

### Code Cell Sanitization

- Dangerous code is commented out with security warnings
- Original code is preserved as comments for reference
- Cell outputs are cleared
- Execution count is reset

Example:

```python
# ⚠️ SECURITY WARNING: This cell has been disabled due to security risks (eval, exec)
# To run this cell, enable YOLO Mode in settings

# Original code:
# eval('__import__("os").system("rm -rf /")')
```

### Markdown Cell Sanitization

- Script tags are replaced with `[REMOVED: script tag]`
- IFrame tags are replaced with `[REMOVED: iframe]`
- JavaScript protocols are replaced with `[REMOVED]:`
- Event handlers are prefixed with `data-removed=`

### Output Sanitization

- HTML outputs containing scripts are removed
- JavaScript outputs are replaced with plain text warnings
- Data URIs with HTML content are flagged

## Best Practices

### For Notebook Authors

1. **Avoid dangerous patterns**: Use subprocess.run() instead of eval/exec
2. **Validate inputs**: Never execute user input directly
3. **Use virtual environments**: Isolate notebook dependencies
4. **Document requirements**: Clearly state what system access is needed
5. **Test in sandboxes**: Verify notebooks work in restricted environments

### For Notebook Users

1. **Review before running**: Always inspect notebook content before execution
2. **Use YOLO Mode sparingly**: Only for trusted, verified notebooks
3. **Work in containers**: Use Docker or VMs for untrusted notebooks
4. **Check outputs**: Review cell outputs for suspicious content
5. **Keep backups**: Save important data before running unknown notebooks

## Security Risk Examples

### Critical Risk Example

```python
# This will be blocked
eval('__import__("os").system("cat /etc/passwd")')
exec(user_input)  # Never execute user input
!rm -rf /  # Shell commands are blocked
```

### High Risk Example

```python
# These imports will trigger read-only mode
import subprocess
import os
import socket

# Markdown with scripts
"""
<script>alert('XSS')</script>
<iframe src="http://malicious.site"></iframe>
"""
```

### Medium Risk Example

```python
# These will show warnings but allow editing
with open('/etc/hosts', 'r') as f:
    data = f.read()

import requests
response = requests.get('https://api.example.com')
```

## Troubleshooting

### "Cannot modify notebook: Security risks detected"

- **Cause**: The notebook contains critical or high-severity security risks
- **Solution**: Enable YOLO Mode if you trust the notebook source

### "Notebook is in read-only mode"

- **Cause**: Security validation detected dangerous patterns
- **Solution**: Review the security warnings and enable YOLO Mode if needed

### "Cell has been disabled due to security risks"

- **Cause**: Automatic sanitization has commented out dangerous code
- **Solution**: Review the code and enable YOLO Mode to restore functionality

## API Integration

### Programmatic Security Validation

```typescript
import { JupyterNotebookSecurity } from "./jupyter-notebook-security"
import { JupyterNotebookHandler } from "./jupyter-notebook-handler"

// Create security validator
const security = new JupyterNotebookSecurity({
	yoloMode: false,
	maxCellSize: 1024 * 1024,
	trustedSources: ["/trusted/path"],
})

// Load and validate notebook
const handler = await JupyterNotebookHandler.fromFile("notebook.ipynb", { yoloMode: false })

// Check security status
if (handler.hasSecurityRisks()) {
	const risks = handler.getSecurityRisks()
	console.log("Security risks detected:", risks)
}

// Check if editing is allowed
if (handler.isReadOnly()) {
	console.log("Notebook is in read-only mode")
}
```

### Enabling YOLO Mode Programmatically

```typescript
// Enable YOLO Mode for a specific notebook
handler.setYoloMode(true)

// Now editing is allowed regardless of security risks
handler.updateCell(0, 'eval("now this works")')
await handler.save()
```

## Security Compliance

This implementation follows security best practices:

- **Defense in Depth**: Multiple layers of security validation
- **Fail Secure**: Defaults to read-only mode when risks are detected
- **Transparency**: Clear warnings about detected risks
- **User Control**: YOLO Mode for informed consent
- **Preservation**: Original content is preserved during sanitization

## Future Enhancements

Planned improvements to the security system:

- [ ] Configurable risk severity levels
- [ ] Custom pattern definitions
- [ ] Sandbox execution environment
- [ ] Digital signatures for trusted notebooks
- [ ] Security audit logs
- [ ] Integration with corporate security policies

## Support

For questions or issues related to Jupyter notebook security:

1. Check this documentation
2. Review the security warnings in the UI
3. Open an issue on GitHub with the `jupyter-security` label
4. Contact the security team for enterprise deployments
