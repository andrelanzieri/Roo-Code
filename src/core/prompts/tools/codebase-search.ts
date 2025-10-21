import { ToolArgs } from "./types"

export function getCodebaseSearchDescription(args: ToolArgs): string {
	return `## codebase_search
Description: Find files most relevant to the search query using semantic search. Searches based on meaning rather than exact text matches. By default searches entire workspace. Reuse the user's exact wording unless there's a clear reason not to - their phrasing often helps semantic search. Queries MUST be in English (translate if needed).

Parameters:
- query: (required) The search query. Reuse the user's exact wording/question format unless there's a clear reason not to.
- path: (optional) Limit search to specific subdirectory (relative to the current workspace directory ${args.cwd}). Leave empty for entire workspace.

Usage:
<function_calls>
<invoke name="codebase_search">
<parameter name="query">Your natural language query here</parameter>
<parameter name="path">Optional subdirectory path</parameter>
</invoke>
</function_calls>

Example:
<function_calls>
<invoke name="codebase_search">
<parameter name="query">User login and password hashing</parameter>
<parameter name="path">src/auth</parameter>
</invoke>
</function_calls>
`
}
