import { ToolArgs } from "./types"

export function getMorphFastApplyDescription(args: ToolArgs): string | undefined {
	// Only show this tool if Morph API key is configured
	if (!args.settings?.morphApiKey) {
		return undefined
	}

	return `## morph_fast_apply
Description: Use Morph Fast Apply to apply diffs with 98% accuracy. This tool uses Morph's advanced AI model to intelligently apply changes to files, handling complex edits that might fail with standard diff application. Only available when Morph API key is configured.

Parameters:
- path: (required) The path of the file to modify (relative to the current workspace directory ${args.cwd})
- diff: (required) The diff content in SEARCH/REPLACE format

Diff format:
\`\`\`
<<<<<<< SEARCH
[exact content to find including whitespace]
=======
[new content to replace with]
>>>>>>> REPLACE
\`\`\`

Usage:
<morph_fast_apply>
<path>File path here</path>
<diff>
Your search/replace content here
</diff>
</morph_fast_apply>

Example:
<morph_fast_apply>
<path>src/utils.ts</path>
<diff>
<<<<<<< SEARCH
function calculateTotal(items) {
    total = 0
    for item in items:
        total += item
    return total
=======
function calculateTotal(items) {
    return items.reduce((sum, item) => sum + item, 0)
>>>>>>> REPLACE
</diff>
</morph_fast_apply>

Note: This tool provides higher accuracy than standard apply_diff, especially for complex code transformations and when dealing with formatting variations.`
}
