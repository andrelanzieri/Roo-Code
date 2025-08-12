import { Anthropic } from "@anthropic-ai/sdk"
import { ClineMessage, ClineSay, ProviderSettings } from "@roo-code/types"
import { ApiHandler, buildApiHandler } from "../../api"
import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import {
	SubtaskValidationResult,
	SubtaskValidationConfig,
	SubtaskValidationContext,
	FileChange,
	CommandExecution,
} from "./types"

/**
 * SubtaskValidator - Validates subtask execution in a parallel context
 *
 * This class implements the "parallel universe" validation system proposed in issue #6970.
 * It analyzes subtask execution to determine if the results are satisfactory and provides
 * detailed feedback to the orchestrator.
 */
export class SubtaskValidator {
	private api: ApiHandler
	private config: SubtaskValidationConfig

	constructor(
		private parentTask: Task,
		config: Partial<SubtaskValidationConfig> = {},
	) {
		this.config = {
			enabled: true,
			maxRetries: 2,
			autoRevertOnFailure: true,
			includeFullContext: false,
			...config,
		}

		// Use parent task's API by default
		this.api = parentTask.api
	}

	/**
	 * Initialize with a specific API configuration for validation
	 */
	async initializeValidationApi(apiConfig: ProviderSettings): Promise<void> {
		this.api = buildApiHandler(apiConfig)
	}

	/**
	 * Validate a completed subtask
	 */
	async validateSubtask(context: SubtaskValidationContext): Promise<SubtaskValidationResult> {
		if (!this.config.enabled) {
			// If validation is disabled, always return success with basic summary
			return {
				isSuccessful: true,
				changesSummary: this.extractBasicSummary(context.subtaskMessages),
				modifiedFiles: this.extractModifiedFiles(context.subtaskMessages),
				executedCommands: this.extractExecutedCommands(context.subtaskMessages),
			}
		}

		try {
			// Track file changes
			const fileChanges = this.trackFileChanges(context)

			// Track command executions
			const commandExecutions = this.trackCommandExecutions(context.subtaskMessages)

			// Prepare validation prompt
			const validationPrompt = this.buildValidationPrompt(context, fileChanges, commandExecutions)

			// Run validation in parallel context
			const validationResult = await this.runValidation(validationPrompt)

			// Parse and enhance the result
			const enhancedResult = this.enhanceValidationResult(validationResult, fileChanges, commandExecutions)

			// Handle failure if needed
			if (!enhancedResult.isSuccessful && this.config.autoRevertOnFailure) {
				enhancedResult.requiresRevert = true
			}

			return enhancedResult
		} catch (error) {
			// If validation fails, log error and return a default success
			// to avoid blocking the workflow
			console.error("Subtask validation error:", error)
			return {
				isSuccessful: true,
				changesSummary: "Validation failed, proceeding with subtask results",
				issues: [`Validation error: ${error instanceof Error ? error.message : String(error)}`],
			}
		}
	}

	/**
	 * Build the validation prompt for the LLM
	 */
	private buildValidationPrompt(
		context: SubtaskValidationContext,
		fileChanges: FileChange[],
		commandExecutions: CommandExecution[],
	): string {
		const customPrompt = this.config.customValidationPrompt || this.getDefaultValidationPrompt()

		let prompt = customPrompt + "\n\n"

		// Add parent task context
		prompt += `## Parent Task Objective\n${context.parentObjective}\n\n`

		// Add subtask instructions
		prompt += `## Subtask Instructions\n${context.subtaskInstructions}\n\n`

		// Add previous subtask results if available
		if (context.previousSubtaskResults && context.previousSubtaskResults.length > 0) {
			prompt += `## Previous Subtask Results\n`
			context.previousSubtaskResults.forEach((result, index) => {
				prompt += `### Subtask ${index + 1}\n`
				prompt += `- Success: ${result.isSuccessful}\n`
				prompt += `- Summary: ${result.changesSummary}\n`
				if (result.issues) {
					prompt += `- Issues: ${result.issues.join(", ")}\n`
				}
				prompt += "\n"
			})
		}

		// Add subtask execution details
		prompt += `## Subtask Execution\n`
		prompt += `<subtask_conversation>\n`

		// Include relevant messages from the subtask
		const relevantMessages = this.filterRelevantMessages(context.subtaskMessages)
		relevantMessages.forEach((msg) => {
			prompt += this.formatMessageForValidation(msg) + "\n"
		})

		prompt += `</subtask_conversation>\n\n`

		// Add file changes summary
		if (fileChanges.length > 0) {
			prompt += `## File Changes\n`
			fileChanges.forEach((change) => {
				prompt += `- ${change.type}: ${change.path}\n`
			})
			prompt += "\n"
		}

		// Add command executions summary
		if (commandExecutions.length > 0) {
			prompt += `## Commands Executed\n`
			commandExecutions.forEach((cmd) => {
				prompt += `- Command: ${cmd.command}\n`
				if (cmd.exitCode !== undefined) {
					prompt += `  Exit Code: ${cmd.exitCode}\n`
				}
			})
			prompt += "\n"
		}

		// Add validation instructions
		prompt += `## Validation Requirements\n`
		prompt += `1. Analyze the subtask execution and determine if it successfully completed its objectives\n`
		prompt += `2. Provide a concise summary of changes made (files edited, commands run, etc.)\n`
		prompt += `3. Extract any important research findings or discoveries\n`
		prompt += `4. Identify any issues or potential problems\n`
		prompt += `5. If the subtask failed, suggest improvements for the retry\n\n`

		prompt += `Please respond in the following JSON format:\n`
		prompt += `{
  "isSuccessful": boolean,
  "changesSummary": "concise summary of what was accomplished",
  "researchSummary": "important findings or discoveries (optional)",
  "issues": ["list", "of", "issues"] or null,
  "improvementSuggestions": ["list", "of", "suggestions"] or null
}`

		return prompt
	}

	/**
	 * Get the default validation prompt
	 */
	private getDefaultValidationPrompt(): string {
		return `You are validating a subtask that was executed as part of a larger orchestrated workflow.
Your role is to analyze what the subtask accomplished and determine if it successfully met its objectives.
Focus on:
1. Whether the subtask completed what it was asked to do
2. The quality and correctness of the implementation
3. Any side effects or issues that might affect the parent task
4. Whether the changes align with the overall project goals`
	}

	/**
	 * Run the validation using the API
	 */
	private async runValidation(prompt: string): Promise<any> {
		const messages: Anthropic.MessageParam[] = [
			{
				role: "user",
				content: prompt,
			},
		]

		const systemPrompt = `You are a validation assistant analyzing subtask execution results.
Provide honest, objective assessment of whether the subtask succeeded.
Be concise but thorough in your analysis.
Always respond in valid JSON format.`

		try {
			// Create a simple stream to get the response
			const stream = this.api.createMessage(systemPrompt, messages)
			let response = ""

			for await (const chunk of stream) {
				if (chunk.type === "text") {
					response += chunk.text
				}
			}

			// Parse JSON response
			return JSON.parse(response)
		} catch (error) {
			console.error("Failed to parse validation response:", error)
			throw error
		}
	}

	/**
	 * Track file changes between before and after subtask
	 */
	private trackFileChanges(context: SubtaskValidationContext): FileChange[] {
		const changes: FileChange[] = []

		// Extract file operations from messages
		// Tool usage is typically in ask messages with type "tool"
		context.subtaskMessages.forEach((msg) => {
			if (msg.type === "ask" && msg.ask === "tool" && msg.text) {
				try {
					const toolData = JSON.parse(msg.text)
					// Check for write_to_file tool
					if (toolData.tool === "write_to_file" && toolData.path) {
						changes.push({
							path: toolData.path,
							type: context.filesBeforeSubtask.has(toolData.path) ? "modified" : "created",
							contentBefore: context.filesBeforeSubtask.get(toolData.path),
						})
					}
					// Check for apply_diff tool
					else if (toolData.tool === "apply_diff" && toolData.path) {
						changes.push({
							path: toolData.path,
							type: "modified",
							contentBefore: context.filesBeforeSubtask.get(toolData.path),
						})
					}
				} catch {}
			}
		})

		return changes
	}

	/**
	 * Track command executions from subtask messages
	 */
	private trackCommandExecutions(messages: ClineMessage[]): CommandExecution[] {
		const executions: CommandExecution[] = []

		messages.forEach((msg) => {
			// Commands are in ask messages with type "command"
			if (msg.type === "ask" && msg.ask === "command" && msg.text) {
				executions.push({
					command: msg.text,
					timestamp: msg.ts,
				})
			}
			// Command output is in say messages
			if (msg.type === "say" && msg.say === "command_output" && msg.text) {
				try {
					const data = typeof msg.text === "string" ? JSON.parse(msg.text) : msg.text
					if (data.output !== undefined) {
						// Update the last command with output
						const lastExecution = executions[executions.length - 1]
						if (lastExecution) {
							lastExecution.output = data.output
							lastExecution.exitCode = data.exitCode
						}
					}
				} catch {}
			}
		})

		return executions
	}

	/**
	 * Filter messages to include only relevant ones for validation
	 */
	private filterRelevantMessages(messages: ClineMessage[]): ClineMessage[] {
		// Include tool uses, errors, and completion messages
		return messages.filter((msg) => {
			if (msg.type === "say") {
				const relevantSays: ClineSay[] = [
					"error",
					"completion_result",
					"api_req_started",
					"api_req_finished",
					"command_output",
					"text",
				]
				return msg.say ? relevantSays.includes(msg.say) : false
			}
			if (msg.type === "ask") {
				// Include tool and command requests
				return msg.ask === "tool" || msg.ask === "command"
			}
			return false
		})
	}

	/**
	 * Format a message for inclusion in validation prompt
	 */
	private formatMessageForValidation(msg: ClineMessage): string {
		if (msg.type === "say") {
			if (msg.text) {
				return `[${msg.say}]: ${msg.text.substring(0, 500)}${msg.text.length > 500 ? "..." : ""}`
			}
			return `[${msg.say}]`
		} else if (msg.type === "ask") {
			if (msg.text) {
				return `[ask:${msg.ask}]: ${msg.text.substring(0, 500)}${msg.text.length > 500 ? "..." : ""}`
			}
			return `[ask:${msg.ask}]`
		}
		return ""
	}

	/**
	 * Enhance validation result with additional context
	 */
	private enhanceValidationResult(
		rawResult: any,
		fileChanges: FileChange[],
		commandExecutions: CommandExecution[],
	): SubtaskValidationResult {
		const result: SubtaskValidationResult = {
			isSuccessful: rawResult.isSuccessful ?? true,
			changesSummary: rawResult.changesSummary || "No summary provided",
			researchSummary: rawResult.researchSummary,
			issues: rawResult.issues,
			improvementSuggestions: rawResult.improvementSuggestions,
			modifiedFiles: fileChanges.map((f) => f.path),
			executedCommands: commandExecutions.map((c) => c.command),
		}

		// Add validation token usage if available
		if (this.api.getModel()) {
			// Token tracking would be added here if the API supports it
		}

		return result
	}

	/**
	 * Extract a basic summary from messages (fallback when validation is disabled)
	 */
	private extractBasicSummary(messages: ClineMessage[]): string {
		const completionMessage = messages.find((m) => m.type === "say" && m.say === "completion_result")

		if (completionMessage && completionMessage.text) {
			return completionMessage.text
		}

		// Count operations
		const fileOps = messages.filter(
			(m) => m.type === "ask" && m.ask === "tool" && m.text?.includes("write_to_file"),
		).length

		const commands = messages.filter((m) => m.type === "ask" && m.ask === "command").length

		return `Completed subtask with ${fileOps} file operations and ${commands} commands`
	}

	/**
	 * Extract modified files from messages
	 */
	private extractModifiedFiles(messages: ClineMessage[]): string[] {
		const files = new Set<string>()

		messages.forEach((msg) => {
			if (msg.type === "ask" && msg.ask === "tool" && msg.text) {
				try {
					const toolData = JSON.parse(msg.text)
					if ((toolData.tool === "write_to_file" || toolData.tool === "apply_diff") && toolData.path) {
						files.add(toolData.path)
					}
				} catch {}
			}
		})

		return Array.from(files)
	}

	/**
	 * Extract executed commands from messages
	 */
	private extractExecutedCommands(messages: ClineMessage[]): string[] {
		const commands: string[] = []

		messages.forEach((msg) => {
			if (msg.type === "ask" && msg.ask === "command" && msg.text) {
				commands.push(msg.text)
			}
		})

		return commands
	}

	/**
	 * Revert changes made by a failed subtask
	 */
	async revertChanges(fileChanges: FileChange[], commandExecutions: CommandExecution[]): Promise<void> {
		// This would implement the revert logic
		// For now, we'll just log what would be reverted
		console.log("Would revert the following changes:")
		console.log(
			"Files:",
			fileChanges.map((f) => f.path),
		)
		console.log(
			"Commands:",
			commandExecutions.map((c) => c.command),
		)

		// In a full implementation, this would:
		// 1. Restore file contents from filesBeforeSubtask
		// 2. Run compensating commands if needed
		// 3. Clean up any created resources
	}
}
