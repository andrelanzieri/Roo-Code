import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"

import { TodoItem } from "@roo-code/types"

import { Task } from "../task/Task"
import { getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { parseMarkdownChecklist } from "./UpdateTodoListTool"
import { Package } from "../../shared/package"
import { BaseTool, ToolCallbacks } from "./BaseTool"
import type { ToolUse } from "../../shared/tools"

interface NewTaskParams {
	mode: string
	message: string
	todos?: string
}

/** Counts completed new_task tool blocks in the current assistant message. */
function countNewTaskBlocks(task: Task): number {
	if (!task.assistantMessageContent) {
		return 0
	}
	return task.assistantMessageContent.filter(
		(block) => block.type === "tool_use" && (block as any).name === "new_task" && !(block as any).partial,
	).length
}

/** Checks if there are any tool blocks AFTER the current streaming index that haven't been processed yet. */
function hasRemainingToolBlocks(task: Task): boolean {
	if (!task.assistantMessageContent) {
		return false
	}
	// Check all blocks after the current streaming index (which is the new_task we're processing)
	// If there are any non-partial tool blocks remaining, we need to queue this new_task
	for (let i = task.currentStreamingContentIndex + 1; i < task.assistantMessageContent.length; i++) {
		const block = task.assistantMessageContent[i]
		if (block.type === "tool_use" && !(block as any).partial) {
			return true
		}
	}
	return false
}

export class NewTaskTool extends BaseTool<"new_task"> {
	readonly name = "new_task" as const

	parseLegacy(params: Partial<Record<string, string>>): NewTaskParams {
		return {
			mode: params.mode || "",
			message: params.message || "",
			todos: params.todos,
		}
	}

	async execute(params: NewTaskParams, task: Task, callbacks: ToolCallbacks): Promise<void> {
		const { mode, message, todos } = params
		const { askApproval, handleError, pushToolResult, toolProtocol, toolCallId } = callbacks

		try {
			// Validate required parameters.
			if (!mode) {
				task.consecutiveMistakeCount++
				task.recordToolError("new_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("new_task", "mode"))
				return
			}

			if (!message) {
				task.consecutiveMistakeCount++
				task.recordToolError("new_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("new_task", "message"))
				return
			}

			// Get the VSCode setting for requiring todos.
			const provider = task.providerRef.deref()

			if (!provider) {
				pushToolResult(formatResponse.toolError("Provider reference lost"))
				return
			}

			const state = await provider.getState()

			// Use Package.name (dynamic at build time) as the VSCode configuration namespace.
			// Supports multiple extension variants (e.g., stable/nightly) without hardcoded strings.
			const requireTodos = vscode.workspace
				.getConfiguration(Package.name)
				.get<boolean>("newTaskRequireTodos", false)

			// Check if todos are required based on VSCode setting.
			// Note: `undefined` means not provided, empty string is valid.
			if (requireTodos && todos === undefined) {
				task.consecutiveMistakeCount++
				task.recordToolError("new_task")
				task.didToolFailInCurrentTurn = true
				pushToolResult(await task.sayAndCreateMissingParamError("new_task", "todos"))
				return
			}

			// Parse todos if provided, otherwise use empty array
			let todoItems: TodoItem[] = []
			if (todos) {
				try {
					todoItems = parseMarkdownChecklist(todos)
				} catch (error) {
					task.consecutiveMistakeCount++
					task.recordToolError("new_task")
					task.didToolFailInCurrentTurn = true
					pushToolResult(formatResponse.toolError("Invalid todos format: must be a markdown checklist"))
					return
				}
			}

			task.consecutiveMistakeCount = 0

			// Un-escape \\@ -> \@ for hierarchical subtasks
			const unescapedMessage = message.replace(/\\\\@/g, "\\@")

			// Verify the mode exists
			const targetMode = getModeBySlug(mode, state?.customModes)

			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
				return
			}

			const toolMessage = JSON.stringify({
				tool: "newTask",
				mode: targetMode.name,
				content: message,
				todos: todoItems,
			})

			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			if (task.enableCheckpoints) {
				task.checkpointSave(true)
			}

			// Queue this new_task if there are:
			// 1. Multiple new_task blocks (to execute sequentially), OR
			// 2. Any remaining tool blocks after this one (so they can execute before delegation)
			const newTaskBlockCount = countNewTaskBlocks(task)
			const hasRemainingTools = hasRemainingToolBlocks(task)

			if (newTaskBlockCount > 1 || hasRemainingTools) {
				task.pendingSubtasks.push({
					toolCallId: toolCallId ?? "",
					message: unescapedMessage,
					mode,
					todoItems,
				})
				return
			}

			// Save other tool results (e.g., update_todo_list) that were called in the same turn.
			// This prevents them from being lost or incorrectly ordered when the parent resumes.
			const currentToolCallId = toolCallId ?? ""
			const otherToolResults = task.userMessageContent.filter(
				(block): block is Anthropic.ToolResultBlockParam =>
					block.type === "tool_result" && block.tool_use_id !== currentToolCallId,
			)

			if (otherToolResults.length > 0) {
				task.pendingOtherToolResults = otherToolResults
			}

			// Track this subtask and clear userMessageContent to prevent incorrect flushing
			task.currentSubtaskToolCallId = currentToolCallId
			task.userMessageContent = []

			// Save state before delegation so it survives parent disposal
			await task.savePendingSubtasks()

			const child = await (provider as any).delegateParentAndOpenChild({
				parentTaskId: task.taskId,
				message: unescapedMessage,
				initialTodos: todoItems,
				mode,
			})

			pushToolResult(`Delegated to child task ${child.taskId}`)
			return
		} catch (error) {
			await handleError("creating new task", error)
			return
		}
	}

	override async handlePartial(task: Task, block: ToolUse<"new_task">): Promise<void> {
		const mode: string | undefined = block.params.mode
		const message: string | undefined = block.params.message
		const todos: string | undefined = block.params.todos

		const partialMessage = JSON.stringify({
			tool: "newTask",
			mode: this.removeClosingTag("mode", mode, block.partial),
			content: this.removeClosingTag("message", message, block.partial),
			todos: this.removeClosingTag("todos", todos, block.partial),
		})

		await task.ask("tool", partialMessage, block.partial).catch(() => {})
	}
}

export const newTaskTool = new NewTaskTool()
