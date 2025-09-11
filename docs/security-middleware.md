# RooCode Security Middleware

## Overview

The RooCode Security Middleware provides enhanced, granular file access control beyond the traditional `.rooignore` functionality. It introduces a flexible YAML-based configuration system with support for ASK actions (prompting users for approval), regex patterns, and a three-tier configuration hierarchy.

## Key Features

### 1. **ASK Action Support**

Instead of just blocking file access, the middleware can prompt users for approval before allowing access to sensitive files.

### 2. **YAML Configuration**

More flexible and readable configuration format compared to gitignore-style patterns.

### 3. **Three-Tier Configuration Hierarchy**

- **Enterprise**: Organization-wide policies (cannot be overridden)
- **Global**: User-level defaults (~/.roo-security.yaml)
- **Project**: Project-specific rules (.roo-security.yaml)
- **Custom**: Personal overrides (.roo-security-custom.yaml)

### 4. **Regex Pattern Support**

In addition to gitignore-style patterns, supports regular expressions for complex matching.

### 5. **Rule Priority System**

Fine-grained control over which rules take precedence when multiple patterns match.

## Configuration File Format

### Basic Structure

```yaml
version: "1.0"
security:
    enabled: true
    inheritRules: true # Whether to inherit rules from higher levels
    defaultAction: ALLOW # Default when no rules match (ALLOW, BLOCK, or ASK)
    askMessagePrefix: "Security check" # Prefix for ASK prompts

    rules:
        - pattern: "**/.env*" # Gitignore-style pattern
          action: ASK # ALLOW, BLOCK, or ASK
          priority: 90 # Higher numbers = higher priority
          description: "Environment files may contain secrets"
          askMessage: "Access to ${file} requires approval" # Custom prompt
          applyToCommands: true # Also check terminal commands
```

### Pattern Types

1. **Gitignore-style patterns**:

    - `*.log` - Match all log files
    - `**/.env*` - Match .env files in any directory
    - `src/**/*.test.js` - Match test files in src

2. **Regular expressions** (enclosed in forward slashes):
    - `/.*\.secret\..*/` - Match files with .secret. in the name
    - `/.*[Ss][Ss][Nn].*\d{3}-\d{2}-\d{4}.*/` - Match potential SSN patterns

## Configuration Hierarchy

### 1. Enterprise Configuration

- Managed by organization administrators
- Cannot be overridden by lower levels
- Typically enforces compliance requirements (GDPR, HIPAA, PCI-DSS)

### 2. Global Configuration

- Located at `~/.roo-security.yaml`
- User's personal default security settings
- Applies to all projects unless overridden

### 3. Project Configuration

- Located at `project-root/.roo-security.yaml`
- Project-specific security rules
- Can inherit or override global rules

### 4. Custom Configuration

- Located at `project-root/.roo-security-custom.yaml`
- Personal overrides for the current project
- Highest priority (except for enterprise rules with `inheritRules: false`)

## Rule Evaluation Order

1. Rules are evaluated from **Custom → Project → Global → Enterprise**
2. Within each level, rules are sorted by priority (highest first)
3. First matching rule determines the action
4. If no rules match, the `defaultAction` is applied

## Actions

### BLOCK

Completely prevents access to the file. The operation fails with an error message.

```yaml
- pattern: "**/.ssh/**"
  action: BLOCK
  description: "SSH keys must not be accessed"
```

### ASK

Prompts the user for approval before allowing access. If approved, access is granted; if denied, access is blocked.

```yaml
- pattern: "**/*.key"
  action: ASK
  askMessage: "File ${file} appears to be a private key. Allow access?"
```

### ALLOW

Explicitly allows access to the file. Useful for overriding inherited rules.

```yaml
- pattern: "test/fixtures/**"
  action: ALLOW
  description: "Test fixtures are safe to access"
```

## Integration with .rooignore

The Enhanced Security Middleware maintains full backward compatibility with `.rooignore`:

1. `.rooignore` patterns are always evaluated first
2. Files blocked by `.rooignore` cannot be allowed by security rules
3. Security middleware adds additional layers of protection

## Usage Examples

### Example 1: Protecting Sensitive Files

```yaml
# .roo-security.yaml
version: "1.0"
security:
    enabled: true
    rules:
        - pattern: "**/production.yml"
          action: BLOCK
          priority: 100
          description: "Production configuration"

        - pattern: "**/*.pem"
          action: ASK
          priority: 90
          askMessage: "Certificate file ${file} - approve access?"
```

### Example 2: Development Overrides

```yaml
# .roo-security-custom.yaml
version: "1.0"
security:
    enabled: true
    inheritRules: true
    rules:
        # Override project rule for local development
        - pattern: ".env.local"
          action: ALLOW
          priority: 200
          description: "Local development environment"
```

### Example 3: Enterprise Compliance

```yaml
# Enterprise configuration (managed centrally)
version: '1.0'
security:
  enabled: true
  inheritRules: false  # Cannot be overridden
  rules:
    - pattern: "**/pii/**"
      action: BLOCK
      priority: 1000
      description: "GDPR compliance - PII protection"

    - pattern: "/.*credit.*card.*\d{4}.*/"
      action: BLOCK
      priority: 1000
      description: "PCI-DSS compliance"
```

## Command-Line Access Control

The middleware also validates terminal commands that attempt to read files:

```yaml
rules:
    - pattern: "**/.env*"
      action: BLOCK
      applyToCommands: true # Also blocks: cat .env, type .env, etc.
```

Supported commands:

- Unix: `cat`, `less`, `more`, `head`, `tail`, `grep`, `awk`, `sed`
- PowerShell: `Get-Content`, `gc`, `type`, `Select-String`, `sls`

## API Usage

### TypeScript Integration

```typescript
import { EnhancedRooIgnoreController } from "./core/ignore/EnhancedRooIgnoreController"
import { SecurityEvaluation } from "./core/security/types"

// Initialize with security middleware
const controller = new EnhancedRooIgnoreController(projectPath, {
	enableSecurityMiddleware: true,
	askHandler: async (evaluation: SecurityEvaluation) => {
		// Show prompt to user
		const approved = await vscode.window.showWarningMessage(evaluation.message, "Allow", "Deny")
		return approved === "Allow"
	},
	securityOptions: {
		debug: true,
		globalConfigPath: "~/.roo-security.yaml",
	},
})

// Initialize (loads configurations)
await controller.initialize()

// Check file access (async for proper ASK handling)
const result = await controller.validateAccessAsync("config/secrets.yml")
if (!result.allowed) {
	if (result.requiresApproval) {
		console.log("File requires approval:", result.evaluation?.message)
	} else {
		console.log("File access blocked:", result.evaluation?.message)
	}
}

// Check command execution
const cmdResult = await controller.validateCommandAsync("cat .env")
if (!cmdResult.allowed) {
	console.log("Command blocked:", cmdResult.evaluation?.message)
}
```

### Statistics and Monitoring

```typescript
// Get security statistics
const stats = controller.getSecurityStats()
console.log(`Total evaluations: ${stats.totalEvaluations}`)
console.log(`Blocked: ${stats.blockedCount}`)
console.log(`Asked: ${stats.askedCount}`)
console.log(`Allowed: ${stats.allowedCount}`)

// Export configuration
const yamlConfig = await controller.exportSecurityConfig("project")
console.log("Current project config:", yamlConfig)

// Import new configuration
await controller.importSecurityConfig(newYamlContent, "custom")
```

## Best Practices

### 1. Start with Defaults

Begin with sensible defaults at the global level, then add project-specific rules as needed.

### 2. Use Priority Wisely

- 1000: Critical security rules (enterprise/compliance)
- 100-999: Important project rules
- 50-99: Standard rules
- 1-49: Low-priority suggestions

### 3. Provide Clear Messages

Always include descriptive `askMessage` and `description` fields to help users understand why access is being controlled.

### 4. Test Your Rules

Use the custom configuration file to test new rules before adding them to project or global configs.

### 5. Regular Expressions

Use regex patterns sparingly and test thoroughly. They're powerful but can have performance implications.

### 6. Command Protection

Enable `applyToCommands: true` for truly sensitive files to prevent command-line access.

## Migration from .rooignore

The security middleware is fully backward compatible. To migrate:

1. Keep your `.rooignore` file as-is
2. Create `.roo-security.yaml` for new rules
3. Gradually move patterns from `.rooignore` to YAML configs
4. Use ASK action for files that need conditional access

## Troubleshooting

### Rules Not Being Applied

1. Check that `enabled: true` is set
2. Verify file paths are relative to project root
3. Check rule priority - higher priority rules match first
4. Enable debug mode to see evaluation details

### ASK Prompts Not Showing

1. Ensure `askHandler` is configured in the controller
2. Check that the UI component is properly connected
3. Verify the pattern matches the file path

### Performance Issues

1. Avoid overly complex regex patterns
2. Limit the number of rules per configuration level
3. Use gitignore-style patterns when possible

## Security Considerations

1. **Enterprise rules** should be immutable and audited
2. **Sensitive patterns** should use BLOCK, not ASK
3. **Regular expressions** should be carefully reviewed for ReDoS vulnerabilities
4. **Custom configurations** should be excluded from version control if they contain sensitive patterns

## Future Enhancements

- [ ] Cloud-based enterprise configuration management
- [ ] Audit logging for all security decisions
- [ ] Machine learning-based sensitive data detection
- [ ] Integration with secret scanning tools
- [ ] Role-based access control (RBAC)
- [ ] Time-based access rules
- [ ] Contextual rules based on git branch or environment
