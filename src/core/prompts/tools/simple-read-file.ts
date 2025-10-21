import { ToolArgs } from "./types"

/**
 * Generate a simplified read_file tool description for models that only support single file reads
 * Uses the simpler format: <function_calls><invoke name="read_file"><parameter name="path">file/path.ext</parameter></invoke></function_calls>
 */
export function getSimpleReadFileDescription(args: ToolArgs): string {
	return `## read_file
Description: Request to read the contents of a file. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when discussing code.

Parameters:
- path: (required) File path (relative to workspace directory ${args.cwd})

Usage:
<function_calls>
<invoke name="read_file">
<parameter name="path">path/to/file</parameter>
</invoke>
</function_calls>

Examples:

1. Reading a TypeScript file:
<function_calls>
<invoke name="read_file">
<parameter name="path">src/app.ts</parameter>
</invoke>
</function_calls>

2. Reading a configuration file:
<function_calls>
<invoke name="read_file">
<parameter name="path">config.json</parameter>
</invoke>
</function_calls>

3. Reading a markdown file:
<function_calls>
<invoke name="read_file">
<parameter name="path">README.md</parameter>
</invoke>
</function_calls>`
}
