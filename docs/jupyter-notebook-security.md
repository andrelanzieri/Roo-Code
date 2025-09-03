# Jupyter Notebook Security

This document describes the security features implemented for Jupyter notebook support in Roo Code.

## Overview

Jupyter notebooks can contain and execute arbitrary code, which poses significant security risks. To address these concerns, we've implemented a comprehensive security layer that validates, sanitizes, and controls notebook operations.

## Security Features

### 1. Content Validation

The security module validates notebook content for:

- **Dangerous Code Patterns**: Detects usage of `eval`, `exec`, `compile`, `__import__`, and other potentially dangerous functions
- **System Commands**: Identifies shell commands (`!command` or `%system`)
- **File System Access**: Detects file operations (`open`, `read`, `write`)
- **Network Operations**: Identifies network requests and socket operations
- **Dangerous Imports**: Blocks imports of modules like `subprocess`, `os`, `socket`, `pickle`, etc.
- **Script Injection**: Detects JavaScript in markdown cells and HTML outputs

### 2. Sanitization

When security risks are detected, the system can:

- Remove or disable dangerous code cells
- Clear cell outputs that may contain malicious content
- Strip JavaScript and iframes from markdown cells
- Remove suspicious metadata fields
- Add warning comments to dangerous cells

### 3. Read-Only Mode

Notebooks with security risks are automatically opened in read-only mode, preventing:

- Cell modifications
- Cell additions or deletions
- Saving changes to disk

### 4. Security Configuration

The security system is configurable with options for:

```typescript
interface SecurityConfig {
	allowCodeExecution?: boolean // Default: false
	readOnlyMode?: boolean // Default: true
	maxCellSize?: number // Default: 1MB
	maxCellCount?: number // Default: 1000
	allowDangerousImports?: boolean // Default: false
	blockedPatterns?: RegExp[] // Custom patterns to block
	allowedOutputTypes?: string[] // Allowed MIME types
	enableWarnings?: boolean // Default: true
	trustedSources?: string[] // Trusted file paths
}
```

### 5. Trusted Sources

You can mark specific notebooks or directories as trusted to bypass security restrictions:

```typescript
const securityConfig = {
	trustedSources: ["/path/to/trusted/notebook.ipynb", "/trusted/directory/*"],
}
```

## Security Levels

The system categorizes risks into four severity levels:

1. **Low**: Informational warnings (e.g., file access)
2. **Medium**: Potentially dangerous operations (e.g., network requests)
3. **High**: Dangerous operations (e.g., dangerous imports)
4. **Critical**: Extremely dangerous operations (e.g., eval/exec, system commands)

## Usage Examples

### Basic Usage

```typescript
import { JupyterNotebookHandler } from "./jupyter-notebook-handler"

// Load notebook with default security settings
const handler = await JupyterNotebookHandler.fromFile("notebook.ipynb")

// Check if notebook is in read-only mode
if (handler.isInReadOnlyMode()) {
	console.log("Notebook opened in read-only mode due to security concerns")
}

// Get security recommendations
const recommendations = handler.getSecurityRecommendations()
recommendations.forEach((rec) => console.log(rec))
```

### Custom Security Configuration

```typescript
const securityConfig = {
	readOnlyMode: false, // Allow edits
	allowDangerousImports: false, // Block dangerous imports
	maxCellSize: 500000, // 500KB max per cell
	enableWarnings: true, // Show security warnings
	trustedSources: [
		// Trust specific paths
		"/my/trusted/notebooks/",
	],
}

const handler = await JupyterNotebookHandler.fromFile("notebook.ipynb", securityConfig)
```

### Checking Operations

```typescript
// Check if specific operations are allowed
const canRead = handler.wouldAllowOperation("read") // Always true
const canWrite = handler.wouldAllowOperation("write") // Depends on validation
const canExecute = handler.wouldAllowOperation("execute") // Requires explicit permission
```

### Getting Sanitized Content

```typescript
// Get a sanitized version of the notebook
const sanitized = handler.getSanitizedNotebook()

// Sanitized notebook will have:
// - Dangerous code cells disabled with warnings
// - Scripts removed from markdown cells
// - Outputs cleared from risky cells
// - Suspicious metadata removed
```

## Security Best Practices

1. **Never execute untrusted notebooks**: Even with security measures, executing arbitrary code is dangerous
2. **Review notebooks before execution**: Always inspect notebook content before running cells
3. **Use isolated environments**: Run notebooks in containers or virtual machines when possible
4. **Limit file system access**: Restrict notebook access to specific directories
5. **Monitor network activity**: Be aware of notebooks that make network requests
6. **Keep backups**: Always backup important data before running unknown notebooks

## Risk Mitigation

The security implementation addresses the concerns raised about Jupyter notebooks by:

1. **Preventing automatic code execution**: Code execution is disabled by default
2. **Detecting malicious patterns**: Comprehensive pattern matching for dangerous code
3. **Sanitizing content**: Automatic removal of dangerous elements
4. **Providing transparency**: Clear warnings and recommendations about risks
5. **Enforcing restrictions**: Read-only mode for untrusted content
6. **Allowing configuration**: Flexible security settings for different use cases

## Limitations

While the security measures significantly reduce risks, they cannot guarantee complete safety:

- Sophisticated obfuscation techniques may bypass detection
- Zero-day vulnerabilities in the Python interpreter or libraries
- Side-channel attacks through resource consumption
- Data exfiltration through allowed operations

Always treat untrusted notebooks with caution and use additional isolation measures when dealing with potentially malicious content.

## Configuration in Roo Code

When Jupyter notebooks are detected in a workspace, Roo Code automatically:

1. Enables the Jupyter notebook diff strategy with security features
2. Validates notebooks on load
3. Shows security warnings in the console
