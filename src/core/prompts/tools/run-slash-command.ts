/**
 * Generates the run_slash_command tool description.
 */
export function getRunSlashCommandDescription(): string {
	return `## run_slash_command
Description: Execute a slash command to get specific instructions or content. Slash commands are predefined templates that provide detailed guidance for common tasks.

Parameters:
- command: (required) The name of the slash command to execute (e.g., "init", "test", "deploy")
- args: (optional) Additional arguments or context to pass to the command

Usage:
<function_calls>
<invoke name="run_slash_command">
<parameter name="command">command_name</parameter>
<parameter name="args">optional arguments</parameter>
</invoke>
</function_calls>

Examples:

1. Running the init command to analyze a codebase:
<function_calls>
<invoke name="run_slash_command">
<parameter name="command">init</parameter>
</invoke>
</function_calls>

2. Running a command with additional context:
<function_calls>
<invoke name="run_slash_command">
<parameter name="command">test</parameter>
<parameter name="args">focus on integration tests</parameter>
</invoke>
</function_calls>

The command content will be returned for you to execute or follow as instructions.`
}
