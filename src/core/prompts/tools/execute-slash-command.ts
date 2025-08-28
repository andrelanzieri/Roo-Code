import { ToolArgs } from "./types"

export function getExecuteSlashCommandDescription(args: ToolArgs): string {
	return `## execute_slash_command
Description: Execute slash commands programmatically. This tool allows you to trigger commands that are typically invoked by users through the chat interface using the "/" prefix.
Parameters:
- slash_command: (required) The name of the slash command to execute (without the "/" prefix). Available commands:
  - review: Trigger code review for current changes (requires args like "slack comment: <message>" or "github issue #123")
  - mode: Switch to a different mode (requires mode name as args, e.g., "code", "architect", "debug")
  - checkpoint: Create a checkpoint of current changes
  - diff: Show diff view for current changes
  - test: Run tests for the project (optionally specify test command as args)
- args: (optional) Arguments to pass to the slash command. Required for some commands like "review" and "mode".

Usage:
<execute_slash_command>
<slash_command>command_name</slash_command>
<args>optional arguments</args>
</execute_slash_command>

Examples:

1. Trigger a code review:
<execute_slash_command>
<slash_command>review</slash_command>
<args>slack comment: Please review the authentication implementation</args>
</execute_slash_command>

2. Switch to architect mode:
<execute_slash_command>
<slash_command>mode</slash_command>
<args>architect</args>
</execute_slash_command>

3. Create a checkpoint:
<execute_slash_command>
<slash_command>checkpoint</slash_command>
</execute_slash_command>

4. Show diff view:
<execute_slash_command>
<slash_command>diff</slash_command>
</execute_slash_command>

5. Run tests with custom command:
<execute_slash_command>
<slash_command>test</slash_command>
<args>npm run test:unit</args>
</execute_slash_command>

Note: Some commands may have limited functionality when executed programmatically compared to user invocation. The tool will provide feedback if a command cannot be fully executed.`
}
