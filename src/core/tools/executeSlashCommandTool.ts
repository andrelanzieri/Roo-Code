import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

// Define supported slash commands and their handlers
interface SlashCommandHandler {
	name: string
	description: string
	requiresArgs: boolean
	execute: (cline: Task, args?: string) => Promise<string>
}

// Command registry - maps command names to their handlers
const SLASH_COMMAND_REGISTRY: Record<string, SlashCommandHandler> = {
	review: {
		name: "review",
		description: "Trigger code review for current changes",
		requiresArgs: true,
		execute: async (cline: Task, args?: string) => {
			// The review command is typically handled by creating a new task
			// We'll simulate this by returning a message about what would happen
			if (!args) {
				return "Error: The /review command requires arguments (e.g., 'slack comment: <message>' or 'github issue #123')"
			}

			// In a real implementation, this would trigger the review workflow
			// For now, we'll return a message about what would happen
			return `Would trigger review with arguments: ${args}\n\nNote: To actually trigger a review, use the new_task tool with mode 'code' and message '/review ${args}'`
		},
	},

	mode: {
		name: "mode",
		description: "Switch to a different mode",
		requiresArgs: true,
		execute: async (cline: Task, args?: string) => {
			if (!args) {
				return "Error: The /mode command requires a mode name (e.g., /mode code, /mode architect)"
			}

			const provider = cline.providerRef.deref()
			if (!provider) {
				return "Error: Provider reference lost, cannot switch mode"
			}

			// Parse the mode name from args
			const modeName = args.trim().toLowerCase()

			// Switch mode through the provider
			try {
				await provider.handleModeSwitch(modeName)
				return `Successfully switched to ${modeName} mode`
			} catch (error) {
				return `Failed to switch to ${modeName} mode: ${error.message}`
			}
		},
	},

	checkpoint: {
		name: "checkpoint",
		description: "Create a checkpoint of current changes",
		requiresArgs: false,
		execute: async (cline: Task, args?: string) => {
			try {
				await cline.checkpointSave(true)
				return "Checkpoint created successfully"
			} catch (error) {
				return `Failed to create checkpoint: ${error.message}`
			}
		},
	},

	diff: {
		name: "diff",
		description: "Show diff view for current changes",
		requiresArgs: false,
		execute: async (cline: Task, args?: string) => {
			// The diff command would typically show a diff view
			// Since this requires specific checkpoint data, we'll return guidance
			return "To view diffs, the checkpoint service needs to be properly initialized with specific commit hashes. Use the checkpoint command first to create checkpoints, then diffs can be viewed between them."
		},
	},

	test: {
		name: "test",
		description: "Run tests for the project",
		requiresArgs: false,
		execute: async (cline: Task, args?: string) => {
			// This would typically execute test commands
			// For now, we'll return a message about what would happen
			const testCommand = args || "npm test"
			return `Would execute test command: ${testCommand}\n\nNote: To actually run tests, use the execute_command tool with the appropriate test command.`
		},
	},
}

/**
 * Execute a slash command programmatically
 *
 * @param cline - The Task instance
 * @param block - The tool use block containing command parameters
 * @param askApproval - Function to ask user approval
 * @param handleError - Function to handle errors
 * @param pushToolResult - Function to push tool results
 * @param removeClosingTag - Function to remove closing tags from partial content
 */
export async function executeSlashCommandTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const commandName: string | undefined = block.params.slash_command
	const commandArgs: string | undefined = block.params.args

	try {
		if (block.partial) {
			// For partial blocks, just show the command being typed
			const partialMessage = `execute_slash_command: /${removeClosingTag("slash_command", commandName)} ${removeClosingTag("args", commandArgs) || ""}`
			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		}

		// Validate required parameters
		if (!commandName) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("execute_slash_command")
			pushToolResult(await cline.sayAndCreateMissingParamError("execute_slash_command", "slash_command"))
			return
		}

		// Check if command exists in registry
		const handler = SLASH_COMMAND_REGISTRY[commandName.toLowerCase()]
		if (!handler) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("execute_slash_command")
			const availableCommands = Object.keys(SLASH_COMMAND_REGISTRY).join(", ")
			const errorMessage = `Unknown slash command: /${commandName}. Available commands: ${availableCommands}`
			await cline.say("error", errorMessage)
			pushToolResult(formatResponse.toolError(errorMessage))
			return
		}

		// Check if command requires arguments
		if (handler.requiresArgs && !commandArgs) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("execute_slash_command")
			const errorMessage = `The /${commandName} command requires arguments`
			await cline.say("error", errorMessage)
			pushToolResult(formatResponse.toolError(errorMessage))
			return
		}

		cline.consecutiveMistakeCount = 0

		// Ask for approval to execute the command
		const approvalMessage = `Execute slash command: /${commandName}${commandArgs ? ` ${commandArgs}` : ""}\n\nDescription: ${handler.description}`

		const didApprove = await cline
			.ask("tool", approvalMessage)
			.then((response) => response.response === "yesButtonClicked")

		if (!didApprove) {
			pushToolResult("Slash command execution was rejected by the user.")
			return
		}

		// Execute the command
		const result = await handler.execute(cline, commandArgs)

		// Return the result
		pushToolResult(formatResponse.toolResult(result))
	} catch (error) {
		await handleError("executing slash command", error)
	}
}

/**
 * Get the list of available slash commands
 * This can be used by the system prompt to inform the LLM about available commands
 */
export function getAvailableSlashCommands(): string[] {
	return Object.keys(SLASH_COMMAND_REGISTRY)
}

/**
 * Get detailed information about all slash commands
 * This can be used for documentation or help purposes
 */
export function getSlashCommandsInfo(): Array<{ name: string; description: string; requiresArgs: boolean }> {
	return Object.values(SLASH_COMMAND_REGISTRY).map((handler) => ({
		name: handler.name,
		description: handler.description,
		requiresArgs: handler.requiresArgs,
	}))
}
