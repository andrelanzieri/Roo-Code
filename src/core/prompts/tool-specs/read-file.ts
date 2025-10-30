import type { ToolSpec } from "../../../api/transform/tool-converters"
import type { SystemPromptSettings } from "../types"

/**
 * Tool specification for read_file
 * This defines the schema for reading file contents
 */
export function getReadFileToolSpec(settings?: SystemPromptSettings): ToolSpec {
	const maxConcurrentFileReads = settings?.maxConcurrentFileReads ?? 5

	return {
		name: "read_file",
		description: `Request to read the contents of one or more files. The tool outputs line-numbered content (e.g. "1 | const x = 1") for easy reference when creating diffs or discussing code. Supports text extraction from PDF and DOCX files, but may not handle other binary files properly.\n\n**IMPORTANT: You can read a maximum of ${maxConcurrentFileReads} files in a single request.** If you need to read more files, use multiple sequential read_file requests.`,
		parameters: [
			{
				name: "args",
				type: "object",
				required: true,
				description: "Contains one or more file elements, where each file contains a path",
				properties: {
					file: {
						type: "array",
						description: `Array of file objects to read (maximum ${maxConcurrentFileReads} files)`,
						items: {
							type: "object",
							properties: {
								path: {
									type: "string",
									description: "File path (relative to workspace directory)",
								},
							},
							required: ["path"],
						},
					},
				},
			},
		],
	}
}
// Export a default spec for backward compatibility
export const readFileToolSpec = getReadFileToolSpec()
