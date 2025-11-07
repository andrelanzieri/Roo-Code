# Theia IDE Compatibility Guide

This guide provides instructions for using Roo Code with Theia IDE and other VS Code-compatible environments.

## Known Issues

Roo Code may encounter shell integration issues when running in Theia IDE, showing the error:

```
Shell integration initialization sequence '\x1b]633;A' was not received within 4 seconds
```

## Solution

### 1. Adjust Shell Integration Timeout

Theia IDE may require a longer timeout for shell integration initialization. You can configure this in your VS Code settings:

#### Using Settings UI:

1. Open Settings (Ctrl/Cmd + ,)
2. Search for "roo-cline.terminalShellIntegrationTimeout"
3. Increase the value from the default 5000ms to 10000ms or higher

#### Using settings.json:

```json
{
	"roo-cline.terminalShellIntegrationTimeout": 10000
}
```

The timeout value is in milliseconds (range: 1000-30000ms).

### 2. Manual Shell Integration Setup (Advanced)

If automatic shell integration fails, you can manually configure your shell for Theia:

#### For Bash Users:

Add to your `~/.bashrc`:

```bash
# Detect Theia IDE environment
if [[ "$THEIA_CONFIG_DIR" ]] || [[ -n "$THEIA_WORKSPACE_ROOT" ]] || [[ -n "$GITPOD_REPO_ROOT" ]]; then
    export TERM_PROGRAM="vscode"
    export VSCODE_INJECTION="1"

    # Shell integration functions
    __vsc_prompt_start() { printf '\e]633;A\e\\'; }
    __vsc_prompt_end() { printf '\e]633;B\e\\'; }
    __vsc_command_start() { printf '\e]633;C\e\\'; }
    __vsc_command_complete() {
        local EXIT_CODE=$?
        printf '\e]633;D;%s\e\\' "$EXIT_CODE"
        return $EXIT_CODE
    }

    # Integrate into prompt
    PS1='\[$(__vsc_prompt_start)\]'"$PS1"'\[$(__vsc_prompt_end)\]'

    # Set up command execution hooks
    trap '__vsc_preexec' DEBUG
    __vsc_preexec() {
        [[ -n "${COMP_LINE:-}" ]] && return
        __vsc_command_start
    }

    PROMPT_COMMAND='__vsc_command_complete'
fi
```

#### For Zsh Users:

Add to your `~/.zshrc`:

```zsh
# Detect Theia IDE environment
if [[ "$THEIA_CONFIG_DIR" ]] || [[ -n "$THEIA_WORKSPACE_ROOT" ]] || [[ -n "$GITPOD_REPO_ROOT" ]]; then
    export TERM_PROGRAM="vscode"
    export VSCODE_INJECTION="1"

    # Shell integration functions
    __vsc_prompt_start() { printf '\e]633;A\e\\'; }
    __vsc_prompt_end() { printf '\e]633;B\e\\'; }
    __vsc_command_start() { printf '\e]633;C\e\\'; }
    __vsc_command_complete() {
        local EXIT_CODE=$?
        printf '\e]633;D;%s\e\\' "$EXIT_CODE"
        return $EXIT_CODE
    }

    # Integrate into prompt
    PS1='%{$(__vsc_prompt_start)%}'"$PS1"'%{$(__vsc_prompt_end)%}'

    # Set up command execution hooks
    preexec() {
        __vsc_command_start
    }

    precmd() {
        __vsc_command_complete
    }
fi
```

### 3. Debug Shell Integration Issues

If you continue to experience issues, enable debug logging to help diagnose the problem:

1. Open the VS Code Output panel (View > Output)
2. Select "Roo Code" from the dropdown
3. Look for messages starting with `[TerminalProcess]` which will show:
    - Whether shell integration markers are being detected
    - The timeout duration being used
    - Whether Theia IDE was detected

## Supported Environments

Roo Code automatically detects the following Theia-based environments:

- Eclipse Theia IDE
- Gitpod workspaces
- Eclipse Che environments
- Other environments with `THEIA_CONFIG_DIR` or `THEIA_WORKSPACE_ROOT` variables

## Troubleshooting

### Shell Integration Still Failing?

1. **Verify environment detection**: Check if Roo Code detects Theia by looking for "in Theia IDE" in error messages
2. **Try increasing timeout further**: Some cloud environments may need up to 30000ms
3. **Check shell configuration**: Ensure your shell initialization files are being sourced correctly
4. **Restart Theia IDE**: After making configuration changes, a full restart may be required

### Performance Considerations

- Longer timeouts may delay the initial response when running terminal commands
- The timeout only affects the initial shell integration setup, not command execution
- Once shell integration is established, commands will run normally

## Related Issues

- [Issue #9102](https://github.com/RooCodeInc/Roo-Code/issues/9102) - Original Theia compatibility issue
- [Issue #2017](https://github.com/RooCodeInc/Roo-Code/issues/2017) - Terminal usage with OSC 633 escape sequences
- [Issue #1369](https://github.com/RooCodeInc/Roo-Code/issues/1369) - General shell integration unavailability

## Need Help?

If you continue to experience issues:

1. Report them on our [GitHub Issues](https://github.com/RooCodeInc/Roo-Code/issues)
2. Include your Theia version and environment details
3. Share any error messages from the VS Code Output panel
4. Join our [Discord community](https://discord.gg/roocode) for real-time support
