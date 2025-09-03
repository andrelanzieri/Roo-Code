import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineSayTool } from "../../shared/ExtensionMessage"
import { getReadablePath } from "../../utils/path"

// Import the existing tools that we'll delegate to
import { writeToFileTool } from "./writeToFileTool"
import { applyDiffToolLegacy } from "./applyDiffTool"
import { applyDiffTool } from "./multiApplyDiffTool"
import { insertContentTool } from "./insertContentTool"
import { searchAndReplaceTool } from "./searchAndReplaceTool"
import { executeCommandTool } from "./executeCommandTool"
import { experiments, EXPERIMENT_IDS } from "../../shared/experiments"

/**
 * Tool for performing an edit operation followed by a command execution.
 * This is a composite tool that delegates to existing edit tools and then executes a command.
 *
 * The tool accepts nested XML structure with an <edit> block containing any edit tool,
 * and an <execute> block containing the execute_command tool.
 *
 * If the edit operation fails, the command execution is not attempted.
 */
export async function editAndExecuteTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	// Parse the nested XML structure from the params
	// We'll use a generic 'args' parameter that contains the full XML structure
	const argsContent = block.params.args

	if (block.partial) {
		// For partial blocks, show progress
		const partialMessage = {
			tool: "editAndExecute" as const,
			path: getReadablePath(cline.cwd, ""),
			content: "Processing edit and execute operation...",
		}
		await cline.ask("tool", JSON.stringify(partialMessage), block.partial).catch(() => {})
		return
	}

	// Validate required parameters
	if (!argsContent) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("edit_and_execute")
		pushToolResult(await cline.sayAndCreateMissingParamError("edit_and_execute", "args"))
		return
	}

	// Parse the edit and execute blocks from the args
	const editMatch = argsContent.match(/<edit>([\s\S]*?)<\/edit>/i)
	const executeMatch = argsContent.match(/<execute>([\s\S]*?)<\/execute>/i)

	if (!editMatch || !editMatch[1]) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("edit_and_execute")
		pushToolResult(formatResponse.toolError("Missing or invalid <edit> block in edit_and_execute tool"))
		return
	}

	if (!executeMatch || !executeMatch[1]) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("edit_and_execute")
		pushToolResult(formatResponse.toolError("Missing or invalid <execute> block in edit_and_execute tool"))
		return
	}

	const editContent = editMatch[1].trim()
	const executeContent = executeMatch[1].trim()

	// Parse the edit tool from the edit content
	const editToolNameMatch = editContent.match(/^<(\w+)>/)
	if (!editToolNameMatch) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("edit_and_execute")
		pushToolResult(formatResponse.toolError("Invalid edit tool format in <edit> block"))
		return
	}

	const editToolName = editToolNameMatch[1]

	// Create a ToolUse object for the edit operation
	const editToolUse: ToolUse = {
		type: "tool_use",
		name: editToolName as any, // We'll validate this below
		params: {},
		partial: false,
	}

	// Parse parameters for the edit tool based on its type
	let editSucceeded = false
	let editResult: string = ""

	// Custom result collector for the edit operation
	const collectEditResult = (content: any) => {
		if (typeof content === "string") {
			editResult = content
		} else if (Array.isArray(content)) {
			editResult = content
				.map((item) => (typeof item === "object" && item.type === "text" ? item.text : ""))
				.join("\n")
		}
	}

	try {
		switch (editToolName) {
			case "write_to_file": {
				const pathMatch = editContent.match(/<path>([\s\S]*?)<\/path>/)
				const contentMatch = editContent.match(/<content>([\s\S]*?)<\/content>/)
				const lineCountMatch = editContent.match(/<line_count>([\s\S]*?)<\/line_count>/)

				if (pathMatch) editToolUse.params.path = pathMatch[1].trim()
				if (contentMatch) editToolUse.params.content = contentMatch[1]
				if (lineCountMatch) editToolUse.params.line_count = lineCountMatch[1].trim()

				await writeToFileTool(cline, editToolUse, askApproval, handleError, collectEditResult, removeClosingTag)
				editSucceeded = true
				break
			}
			case "apply_diff": {
				// Check if multi-file apply diff is enabled
				const provider = cline.providerRef.deref()
				let isMultiFileApplyDiffEnabled = false

				if (provider) {
					const state = await provider.getState()
					isMultiFileApplyDiffEnabled = experiments.isEnabled(
						state.experiments ?? {},
						EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF,
					)
				}

				if (isMultiFileApplyDiffEnabled) {
					// For multi-file, use args parameter
					editToolUse.params.args = editContent.replace(/^<apply_diff>/, "").replace(/<\/apply_diff>$/, "")
					await applyDiffTool(
						cline,
						editToolUse,
						askApproval,
						handleError,
						collectEditResult,
						removeClosingTag,
					)
				} else {
					// For single file, parse path and diff
					const pathMatch = editContent.match(/<path>([\s\S]*?)<\/path>/)
					const diffMatch = editContent.match(/<diff>([\s\S]*?)<\/diff>/)

					if (pathMatch) editToolUse.params.path = pathMatch[1].trim()
					if (diffMatch) editToolUse.params.diff = diffMatch[1]

					await applyDiffToolLegacy(
						cline,
						editToolUse,
						askApproval,
						handleError,
						collectEditResult,
						removeClosingTag,
					)
				}
				editSucceeded = true
				break
			}
			case "insert_content": {
				const pathMatch = editContent.match(/<path>([\s\S]*?)<\/path>/)
				const lineMatch = editContent.match(/<line>([\s\S]*?)<\/line>/)
				const contentMatch = editContent.match(/<content>([\s\S]*?)<\/content>/)

				if (pathMatch) editToolUse.params.path = pathMatch[1].trim()
				if (lineMatch) editToolUse.params.line = lineMatch[1].trim()
				if (contentMatch) editToolUse.params.content = contentMatch[1]

				await insertContentTool(
					cline,
					editToolUse,
					askApproval,
					handleError,
					collectEditResult,
					removeClosingTag,
				)
				editSucceeded = true
				break
			}
			case "search_and_replace": {
				const pathMatch = editContent.match(/<path>([\s\S]*?)<\/path>/)
				const searchMatch = editContent.match(/<search>([\s\S]*?)<\/search>/)
				const replaceMatch = editContent.match(/<replace>([\s\S]*?)<\/replace>/)
				const useRegexMatch = editContent.match(/<use_regex>([\s\S]*?)<\/use_regex>/)
				const ignoreCaseMatch = editContent.match(/<ignore_case>([\s\S]*?)<\/ignore_case>/)
				const startLineMatch = editContent.match(/<start_line>([\s\S]*?)<\/start_line>/)
				const endLineMatch = editContent.match(/<end_line>([\s\S]*?)<\/end_line>/)

				if (pathMatch) editToolUse.params.path = pathMatch[1].trim()
				if (searchMatch) editToolUse.params.search = searchMatch[1]
				if (replaceMatch) editToolUse.params.replace = replaceMatch[1]
				if (useRegexMatch) editToolUse.params.use_regex = useRegexMatch[1].trim()
				if (ignoreCaseMatch) editToolUse.params.ignore_case = ignoreCaseMatch[1].trim()
				if (startLineMatch) editToolUse.params.start_line = startLineMatch[1].trim()
				if (endLineMatch) editToolUse.params.end_line = endLineMatch[1].trim()

				await searchAndReplaceTool(
					cline,
					editToolUse,
					askApproval,
					handleError,
					collectEditResult,
					removeClosingTag,
				)
				editSucceeded = true
				break
			}
			default:
				pushToolResult(
					formatResponse.toolError(
						`Unsupported edit tool: ${editToolName}. Supported tools are: write_to_file, apply_diff, insert_content, search_and_replace`,
					),
				)
				return
		}
	} catch (error) {
		await handleError(`executing edit operation (${editToolName})`, error as Error)
		return
	}

	// If edit operation failed, don't proceed with execute
	if (!editSucceeded) {
		pushToolResult(
			formatResponse.toolError(
				`Edit operation failed. Command execution was not attempted.\nEdit result: ${editResult}`,
			),
		)
		return
	}

	// Now parse and execute the command
	const commandMatch = executeContent.match(/<command>([\s\S]*?)<\/command>/)
	const cwdMatch = executeContent.match(/<cwd>([\s\S]*?)<\/cwd>/)

	if (!commandMatch || !commandMatch[1]) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("edit_and_execute")
		pushToolResult(formatResponse.toolError("Missing <command> in <execute> block"))
		return
	}

	// Create a ToolUse object for the execute operation
	const executeToolUse: ToolUse = {
		type: "tool_use",
		name: "execute_command",
		params: {
			command: commandMatch[1].trim(),
		},
		partial: false,
	}

	if (cwdMatch && cwdMatch[1]) {
		executeToolUse.params.cwd = cwdMatch[1].trim()
	}

	// Collect the execute result
	let executeResult: string = ""
	const collectExecuteResult = (content: any) => {
		if (typeof content === "string") {
			executeResult = content
		} else if (Array.isArray(content)) {
			executeResult = content
				.map((item) => (typeof item === "object" && item.type === "text" ? item.text : ""))
				.join("\n")
		}
	}

	try {
		await executeCommandTool(
			cline,
			executeToolUse,
			askApproval,
			handleError,
			collectExecuteResult,
			removeClosingTag,
		)

		// Combine results from both operations
		const combinedResult = [
			"Edit operation completed successfully:",
			editResult,
			"",
			"Command execution result:",
			executeResult,
		].join("\n")

		pushToolResult(combinedResult)

		// Record successful tool usage
		cline.recordToolUsage("edit_and_execute")
	} catch (error) {
		await handleError("executing command after edit", error as Error)
	}
}
