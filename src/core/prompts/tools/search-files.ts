import { ToolArgs } from "./types"

export function getSearchFilesDescription(args: ToolArgs): string {
	return `## search_files
Description: Request to perform a regex search across files in a specified directory, providing context-rich results. This tool searches for patterns or specific content across multiple files, displaying each match with encapsulating context.
Parameters:
- path: (required) The path of the directory to search in (relative to the current workspace directory ${args.cwd}). This directory will be recursively searched.
- regex: (required) The regular expression pattern to search for. Uses Rust regex syntax.
- file_pattern: (optional) Glob pattern to filter files (e.g., '*.ts' for TypeScript files). If not provided, it will search all files (*).
Usage:
<function_calls>
<invoke name="search_files">
<parameter name="path">Directory path here</parameter>
<parameter name="regex">Your regex pattern here</parameter>
<parameter name="file_pattern">file pattern here (optional)</parameter>
</invoke>
</function_calls>

Example: Requesting to search for all .ts files in the current directory
<function_calls>
<invoke name="search_files">
<parameter name="path">.</parameter>
<parameter name="regex">.*</parameter>
<parameter name="file_pattern">*.ts</parameter>
</invoke>
</function_calls>`
}
