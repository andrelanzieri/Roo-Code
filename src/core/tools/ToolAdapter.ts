import { toolRegistry } from "./ToolRegistry"
import { ToolName } from "@roo-code/types"
import { Task } from "../task/Task"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

/**
 * ToolAdapter - Provides backward compatibility with existing tool invocation code
 * This adapter allows the existing codebase to work with the new RooTool classes
 * without requiring immediate changes to all tool invocations.
 *
 * This is a transitional component that can be removed once all code
 * has been updated to use the ToolRegistry directly.
 */
export class ToolAdapter {
	/**
	 * Execute a tool by name using the new RooTool system
	 * This method provides the same interface as the old tool functions
	 * but delegates to the new RooTool implementations
	 */
	static async executeTool(
		toolName: ToolName,
		cline: Task,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void> {
		const tool = toolRegistry.getTool(toolName)

		if (!tool) {
			// Fall back to legacy implementation if tool hasn't been migrated yet
			return ToolAdapter.executeLegacyTool(
				toolName,
				cline,
				block,
				askApproval,
				handleError,
				pushToolResult,
				removeClosingTag,
			)
		}

		// Execute using the new RooTool implementation
		return tool.execute(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
	}

	/**
	 * Execute a legacy tool that hasn't been migrated yet
	 * This allows for gradual migration of tools
	 */
	private static async executeLegacyTool(
		toolName: ToolName,
		cline: Task,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void> {
		// Import and execute legacy tool implementations
		// These imports will be removed as tools are migrated
		switch (toolName) {
			case "write_to_file": {
				// This is already migrated, but keeping as example
				const { writeToFileTool } = await import("../tools/writeToFileTool")
				return writeToFileTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "read_file": {
				const { readFileTool } = await import("../tools/readFileTool")
				return readFileTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "execute_command": {
				const { executeCommandTool } = await import("../tools/executeCommandTool")
				return executeCommandTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "apply_diff": {
				// Use the legacy apply diff for now
				const { applyDiffToolLegacy } = await import("../tools/applyDiffTool")
				return applyDiffToolLegacy(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "search_files": {
				const { searchFilesTool } = await import("../tools/searchFilesTool")
				return searchFilesTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "list_files": {
				const { listFilesTool } = await import("../tools/listFilesTool")
				return listFilesTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "list_code_definition_names": {
				const { listCodeDefinitionNamesTool } = await import("../tools/listCodeDefinitionNamesTool")
				return listCodeDefinitionNamesTool(
					cline,
					block,
					askApproval,
					handleError,
					pushToolResult,
					removeClosingTag,
				)
			}
			case "browser_action": {
				const { browserActionTool } = await import("../tools/browserActionTool")
				return browserActionTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "use_mcp_tool": {
				const { useMcpToolTool } = await import("../tools/useMcpToolTool")
				return useMcpToolTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "access_mcp_resource": {
				const { accessMcpResourceTool } = await import("../tools/accessMcpResourceTool")
				return accessMcpResourceTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "ask_followup_question": {
				const { askFollowupQuestionTool } = await import("../tools/askFollowupQuestionTool")
				return askFollowupQuestionTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "attempt_completion": {
				const { attemptCompletionTool } = await import("../tools/attemptCompletionTool")
				// attemptCompletionTool requires additional parameters
				const toolDescription = () => `[${block.name}]`
				const askFinishSubTaskApproval = async () => {
					const toolMessage = JSON.stringify({ tool: "finishTask" })
					return await askApproval("tool", toolMessage)
				}
				return attemptCompletionTool(
					cline,
					block,
					askApproval,
					handleError,
					pushToolResult,
					removeClosingTag,
					toolDescription,
					askFinishSubTaskApproval,
				)
			}
			case "switch_mode": {
				const { switchModeTool } = await import("../tools/switchModeTool")
				return switchModeTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "new_task": {
				const { newTaskTool } = await import("../tools/newTaskTool")
				return newTaskTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "insert_content": {
				const { insertContentTool } = await import("../tools/insertContentTool")
				return insertContentTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "search_and_replace": {
				const { searchAndReplaceTool } = await import("../tools/searchAndReplaceTool")
				return searchAndReplaceTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "codebase_search": {
				const { codebaseSearchTool } = await import("../tools/codebaseSearchTool")
				return codebaseSearchTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "update_todo_list": {
				const { updateTodoListTool } = await import("../tools/updateTodoListTool")
				return updateTodoListTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "run_slash_command": {
				const { runSlashCommandTool } = await import("../tools/runSlashCommandTool")
				return runSlashCommandTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "generate_image": {
				const { generateImageTool } = await import("../tools/generateImageTool")
				return generateImageTool(cline, block, askApproval, handleError, pushToolResult, removeClosingTag)
			}
			case "fetch_instructions": {
				const { fetchInstructionsTool } = await import("../tools/fetchInstructionsTool")
				return fetchInstructionsTool(cline, block, askApproval, handleError, pushToolResult)
			}
			default:
				throw new Error(`Unknown tool: ${toolName}`)
		}
	}

	/**
	 * Get tool usage description using the new system
	 * Falls back to legacy implementation if needed
	 */
	static getToolUsageDescription(block: ToolUse): string {
		const tool = toolRegistry.getTool(block.name as ToolName)

		if (tool) {
			return tool.getToolUsageDescription(block)
		}

		// Fall back to legacy description logic
		// This is copied from presentAssistantMessage.ts and can be removed
		// once all tools are migrated
		switch (block.name) {
			case "execute_command":
				return `[${block.name} for '${block.params.command}']`
			case "write_to_file":
				return `[${block.name} to '${block.params.path}']`
			case "read_file":
				// This would use the getReadFileToolDescription function
				return `[${block.name} for '${block.params.path || block.params.args}']`
			case "list_files":
				return `[${block.name} for '${block.params.path}']`
			case "list_code_definition_names":
				return `[${block.name} for '${block.params.path}']`
			case "search_files":
				return `[${block.name} for '${block.params.regex}' in '${block.params.path}']`
			case "browser_action":
				return `[${block.name} for '${block.params.action}']`
			case "use_mcp_tool":
				return `[${block.name} for '${block.params.server_name}']`
			case "access_mcp_resource":
				return `[${block.name} for '${block.params.server_name}']`
			case "ask_followup_question":
				return `[${block.name} for '${block.params.question}']`
			case "attempt_completion":
				return `[${block.name}]`
			case "switch_mode":
				return `[${block.name} to '${block.params.mode_slug}'${block.params.reason ? ` because: ${block.params.reason}` : ""}]`
			case "codebase_search":
				return `[${block.name} for '${block.params.query}']`
			case "update_todo_list":
				return `[${block.name}]`
			case "new_task":
				return `[${block.name} in ${block.params.mode} mode: '${block.params.message}']`
			case "run_slash_command":
				return `[${block.name} for '${block.params.command}'${block.params.args ? ` with args: ${block.params.args}` : ""}]`
			case "generate_image":
				return `[${block.name} for '${block.params.path}']`
			default:
				return `[${block.name}]`
		}
	}
}
