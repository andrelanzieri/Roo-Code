import { ToolArgs } from "./types"

export function getListCodeDefinitionNamesDescription(args: ToolArgs): string {
	return `## list_code_definition_names
Description: Request to list definition names (classes, functions, methods, etc.) from source code. This tool can analyze either a single file or all files at the top level of a specified directory. It provides insights into the codebase structure and important constructs, encapsulating high-level concepts and relationships that are crucial for understanding the overall architecture.
Parameters:
- path: (required) The path of the file or directory (relative to the current working directory ${args.cwd}) to analyze. When given a directory, it lists definitions from all top-level source files.
Usage:
<function_calls>
<invoke name="list_code_definition_names">
<parameter name="path">Directory path here</parameter>
</invoke>
</function_calls>

Examples:

1. List definitions from a specific file:
<function_calls>
<invoke name="list_code_definition_names">
<parameter name="path">src/main.ts</parameter>
</invoke>
</function_calls>

2. List definitions from all files in a directory:
<function_calls>
<invoke name="list_code_definition_names">
<parameter name="path">src/</parameter>
</invoke>
</function_calls>`
}
