import { ToolArgs } from "./types"

export function getSearchAndReplaceDescription(args: ToolArgs): string {
	return `## search_and_replace
Description: Use this tool to find and replace specific text strings or patterns (using regex) within a file. It's suitable for targeted replacements across multiple locations within the file. Supports literal text and regex patterns, case sensitivity options, and optional line ranges. Shows a diff preview before applying changes.

Required Parameters:
- path: The path of the file to modify (relative to the current workspace directory ${args.cwd.toPosix()})
- search: The text or pattern to search for
- replace: The text to replace matches with

Optional Parameters:
- start_line: Starting line number for restricted replacement (1-based)
- end_line: Ending line number for restricted replacement (1-based)
- use_regex: Set to "true" to treat search as a regex pattern (default: false)
- ignore_case: Set to "true" to ignore case when matching (default: false)

Notes:
- When use_regex is true, the search parameter is treated as a regular expression pattern
- When ignore_case is true, the search is case-insensitive regardless of regex mode

Examples:

1. Simple text replacement:
<function_calls>
<invoke name="search_and_replace">
<parameter name="path">example.ts</parameter>
<parameter name="search">oldText</parameter>
<parameter name="replace">newText</parameter>
</invoke>
</function_calls>

2. Case-insensitive regex pattern:
<function_calls>
<invoke name="search_and_replace">
<parameter name="path">example.ts</parameter>
<parameter name="search">old\w+</parameter>
<parameter name="replace">new$&</parameter>
<parameter name="use_regex">true</parameter>
<parameter name="ignore_case">true</parameter>
</invoke>
</function_calls>`
}
