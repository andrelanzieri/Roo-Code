import { Anthropic } from "@anthropic-ai/sdk"
import os from "os"
import * as path from "path"
import * as vscode from "vscode"

export function flattenMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
	return messages.flatMap((message) => {
		// Check if this is an Orchestrator message with nested tasks
		if (
			message.role === "assistant" &&
			typeof message.content === "string" &&
			message.content.includes("Orchestrator: Task completed")
		) {
			// This is an Orchestrator completion message, we'll include it but not its nested content
			// as that will be included separately in the history
			return [
				{
					role: message.role,
					content: message.content,
				},
			]
		}

		// For tool_use and tool_result messages, ensure they're properly included
		if (Array.isArray(message.content)) {
			const processedContent = message.content.map((block) => {
				if (block.type === "tool_result" && typeof block.content !== "string" && Array.isArray(block.content)) {
					// Flatten nested tool results
					return {
						...block,
						content: block.content.map(formatContentBlockToMarkdown).join("\n"),
					}
				}
				return block
			})
			return [
				{
					...message,
					content: processedContent,
				},
			]
		}

		return [message]
	})
}

export async function downloadTask(dateTs: number, conversationHistory: Anthropic.MessageParam[]) {
	// File name
	const date = new Date(dateTs)
	const month = date.toLocaleString("en-US", { month: "short" }).toLowerCase()
	const day = date.getDate()
	const year = date.getFullYear()
	let hours = date.getHours()
	const minutes = date.getMinutes().toString().padStart(2, "0")
	const seconds = date.getSeconds().toString().padStart(2, "0")
	const ampm = hours >= 12 ? "pm" : "am"
	hours = hours % 12
	hours = hours ? hours : 12 // the hour '0' should be '12'
	const fileName = `roo_task_${month}-${day}-${year}_${hours}-${minutes}-${seconds}-${ampm}.md`

	// Flatten and process messages for export
	const flattenedHistory = flattenMessages(conversationHistory)

	// Generate markdown
	const markdownContent = flattenedHistory
		.map((message) => {
			const role = message.role === "user" ? "**User:**" : "**Assistant:**"
			const content = Array.isArray(message.content)
				? message.content.map((block) => formatContentBlockToMarkdown(block)).join("\n")
				: message.content
			return `${role}\n\n${content}\n\n`
		})
		.join("---\n\n")

	// Prompt user for save location
	const saveUri = await vscode.window.showSaveDialog({
		filters: { Markdown: ["md"] },
		defaultUri: vscode.Uri.file(path.join(os.homedir(), "Downloads", fileName)),
	})

	if (saveUri) {
		// Write content to the selected location
		await vscode.workspace.fs.writeFile(saveUri, Buffer.from(markdownContent))
		vscode.window.showTextDocument(saveUri, { preview: true })
	}
}

export function formatContentBlockToMarkdown(block: Anthropic.Messages.ContentBlockParam): string {
	switch (block.type) {
		case "text":
			return block.text
		case "image":
			return `[Image]`
		case "tool_use": {
			let input: string
			if (typeof block.input === "object" && block.input !== null) {
				input = Object.entries(block.input)
					.map(([key, value]) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`)
					.join("\n")
			} else {
				input = String(block.input)
			}
			return `[Tool Use: ${block.name}]\n${input}`
		}
		case "tool_result": {
			// For now we're not doing tool name lookup since we don't use tools anymore
			// const toolName = findToolName(block.tool_use_id, messages)
			const toolName = "Tool"
			if (typeof block.content === "string") {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content}`
			} else if (Array.isArray(block.content)) {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]\n${block.content
					.map((contentBlock) => formatContentBlockToMarkdown(contentBlock))
					.join("\n")}`
			} else {
				return `[${toolName}${block.is_error ? " (Error)" : ""}]`
			}
		}
		default:
			return "[Unexpected content type]"
	}
}

export function findToolName(toolCallId: string, messages: Anthropic.MessageParam[]): string {
	for (const message of messages) {
		if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "tool_use" && block.id === toolCallId) {
					return block.name
				}
			}
		}
	}
	return "Unknown Tool"
}
