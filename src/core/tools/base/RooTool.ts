import { Task } from "../../task/Task"
import {
	ToolUse,
	ToolResponse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
	ToolParamName,
} from "../../../shared/tools"
import { ToolName, ToolGroup } from "@roo-code/types"
import { ToolArgs } from "../../prompts/tools/types"

/**
 * Abstract base class for all Roo tools.
 * This class consolidates tool logic including prompts, parameters,
 * implementation, and group associations into a single cohesive unit.
 */
export abstract class RooTool {
	/**
	 * Get the unique name identifier for this tool
	 */
	abstract get name(): ToolName

	/**
	 * Get the groups this tool belongs to
	 */
	abstract get groups(): ToolGroup[]

	/**
	 * Get the required parameters for this tool
	 */
	abstract get requiredParams(): ToolParamName[]

	/**
	 * Get the optional parameters for this tool
	 */
	abstract get optionalParams(): ToolParamName[]

	/**
	 * Get the tool description/prompt for the LLM
	 * @param args Tool arguments including cwd, settings, etc.
	 * @returns The formatted tool description string
	 */
	abstract getDescription(args: ToolArgs): string

	/**
	 * Get a brief description of the tool usage for display purposes
	 * @param block The tool use block containing parameters
	 * @returns A brief description string for display
	 */
	abstract getToolUsageDescription(block: ToolUse): string

	/**
	 * Execute the tool with the given parameters
	 * @param cline The Task instance
	 * @param block The tool use block containing parameters
	 * @param askApproval Function to ask user approval
	 * @param handleError Function to handle errors
	 * @param pushToolResult Function to push tool results
	 * @param removeClosingTag Function to remove closing tags from partial content
	 */
	abstract execute(
		cline: Task,
		block: ToolUse,
		askApproval: AskApproval,
		handleError: HandleError,
		pushToolResult: PushToolResult,
		removeClosingTag: RemoveClosingTag,
	): Promise<void>

	/**
	 * Validate that all required parameters are present
	 * @param params The parameters provided in the tool use
	 * @returns true if all required parameters are present
	 */
	validateParams(params: Partial<Record<ToolParamName, string>>): boolean {
		return this.requiredParams.every((param) => params[param] !== undefined)
	}

	/**
	 * Get all parameters (required and optional)
	 * @returns Array of all parameter names
	 */
	getAllParams(): ToolParamName[] {
		return [...this.requiredParams, ...this.optionalParams]
	}

	/**
	 * Check if this tool belongs to a specific group
	 * @param group The group to check
	 * @returns true if the tool belongs to the group
	 */
	belongsToGroup(group: ToolGroup): boolean {
		return this.groups.includes(group)
	}

	/**
	 * Helper method to handle missing parameter errors
	 * @param cline The Task instance
	 * @param paramName The missing parameter name
	 * @param pushToolResult Function to push tool results
	 */
	protected async handleMissingParam(cline: Task, paramName: string, pushToolResult: PushToolResult): Promise<void> {
		cline.consecutiveMistakeCount++
		cline.recordToolError(this.name)
		pushToolResult(await cline.sayAndCreateMissingParamError(this.name, paramName))
	}

	/**
	 * Helper method to handle rooignore validation
	 * @param cline The Task instance
	 * @param path The path to validate
	 * @param pushToolResult Function to push tool results
	 * @returns true if access is allowed, false otherwise
	 */
	protected async validateRooIgnoreAccess(
		cline: Task,
		path: string,
		pushToolResult: PushToolResult,
	): Promise<boolean> {
		const accessAllowed = cline.rooIgnoreController?.validateAccess(path)

		if (!accessAllowed) {
			const { formatResponse } = await import("../../prompts/responses")
			await cline.say("rooignore_error", path)
			pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(path)))
			return false
		}

		return true
	}
}
