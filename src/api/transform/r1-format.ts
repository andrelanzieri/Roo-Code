import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

type ContentPartText = OpenAI.Chat.ChatCompletionContentPartText
type ContentPartImage = OpenAI.Chat.ChatCompletionContentPartImage
type UserMessage = OpenAI.Chat.ChatCompletionUserMessageParam
type AssistantMessage = OpenAI.Chat.ChatCompletionAssistantMessageParam
type ToolMessage = OpenAI.Chat.ChatCompletionToolMessageParam
type Message = OpenAI.Chat.ChatCompletionMessageParam
type AnthropicMessage = Anthropic.Messages.MessageParam

/**
 * Converts Anthropic messages to OpenAI format while merging consecutive messages with the same role.
 * This is required for DeepSeek Reasoner which does not support successive messages with the same role.
 *
 * This function also handles tool_use and tool_result blocks:
 * - tool_use blocks in assistant messages are converted to tool_calls
 * - tool_result blocks in user messages are converted to role: "tool" messages
 *
 * @param messages Array of Anthropic messages
 * @returns Array of OpenAI messages where consecutive messages with the same role are combined
 */
export function convertToR1Format(messages: AnthropicMessage[]): Message[] {
	const result: Message[] = []

	for (const message of messages) {
		if (message.role === "user") {
			processUserMessage(message, result)
		} else if (message.role === "assistant") {
			processAssistantMessage(message, result)
		}
	}

	return result
}

/**
 * Process a user message, handling tool_result blocks separately from text/image content
 */
function processUserMessage(message: AnthropicMessage, result: Message[]): void {
	if (typeof message.content === "string") {
		// Simple string content - merge with previous user message if possible
		mergeOrAddUserMessage(message.content, result)
		return
	}

	// Separate tool_result blocks from other content
	const toolResults: Anthropic.ToolResultBlockParam[] = []
	const otherContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

	for (const block of message.content) {
		if (block.type === "tool_result") {
			toolResults.push(block)
		} else if (block.type === "text" || block.type === "image") {
			otherContent.push(block)
		}
		// Ignore other block types (user cannot send tool_use)
	}

	// Process tool_result blocks first - they become separate "tool" messages
	// This must come before user content to maintain correct message order
	for (const toolResult of toolResults) {
		const content =
			typeof toolResult.content === "string"
				? toolResult.content
				: (toolResult.content?.map((part) => (part.type === "text" ? part.text : "")).join("\n") ?? "")

		const toolMessage: ToolMessage = {
			role: "tool",
			tool_call_id: toolResult.tool_use_id,
			content: content,
		}
		result.push(toolMessage)
	}

	// Process remaining content (text and images)
	if (otherContent.length > 0) {
		const { content, hasImages } = convertUserContent(otherContent)

		if (hasImages) {
			// If there are images, try to merge with previous user message if possible
			mergeOrAddUserMessageWithArrayContent(content as (ContentPartText | ContentPartImage)[], result)
		} else {
			// Text only - can merge with previous user message
			const textContent =
				typeof content === "string" ? content : (content as ContentPartText[]).map((p) => p.text).join("\n")
			mergeOrAddUserMessage(textContent, result)
		}
	}
}

/**
 * Process an assistant message, handling tool_use blocks as tool_calls
 */
function processAssistantMessage(message: AnthropicMessage, result: Message[]): void {
	if (typeof message.content === "string") {
		// Simple string content - merge with previous assistant message if possible
		mergeOrAddAssistantMessage(message.content, undefined, result)
		return
	}

	// Separate tool_use blocks from other content
	const toolUses: Anthropic.ToolUseBlockParam[] = []
	const otherContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

	for (const block of message.content) {
		if (block.type === "tool_use") {
			toolUses.push(block)
		} else if (block.type === "text" || block.type === "image") {
			otherContent.push(block)
		}
		// Ignore other block types (assistant cannot send tool_result)
	}

	// Convert text content - preserve empty strings
	let textContent: string | undefined
	if (otherContent.length > 0) {
		const texts = otherContent
			.filter((part) => part.type === "text")
			.map((part) => (part as Anthropic.TextBlockParam).text)
		// If there were text blocks, join them (even if empty)
		// If there were no text blocks, textContent remains undefined
		if (texts.length > 0) {
			textContent = texts.join("\n")
		}
	}

	// Convert tool_use blocks to tool_calls
	let toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined
	if (toolUses.length > 0) {
		toolCalls = toolUses.map((toolUse) => ({
			id: toolUse.id,
			type: "function" as const,
			function: {
				name: toolUse.name,
				arguments: JSON.stringify(toolUse.input),
			},
		}))
	}

	// If there are tool calls, we cannot merge (tool_calls must be in their own message)
	if (toolCalls && toolCalls.length > 0) {
		const assistantMessage: AssistantMessage = {
			role: "assistant",
			content: textContent || null,
			tool_calls: toolCalls,
		}
		result.push(assistantMessage)
	} else if (textContent !== undefined) {
		// No tool calls - can merge with previous assistant message
		// Note: textContent can be empty string "" which should be preserved
		mergeOrAddAssistantMessage(textContent, undefined, result)
	}
}

/**
 * Convert user content blocks to OpenAI format
 */
function convertUserContent(content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[]): {
	content: string | (ContentPartText | ContentPartImage)[]
	hasImages: boolean
} {
	const textParts: string[] = []
	const imageParts: ContentPartImage[] = []
	let hasImages = false

	for (const part of content) {
		if (part.type === "text") {
			textParts.push(part.text)
		} else if (part.type === "image") {
			hasImages = true
			imageParts.push({
				type: "image_url",
				image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
			})
		}
	}

	if (hasImages) {
		const parts: (ContentPartText | ContentPartImage)[] = []
		if (textParts.length > 0) {
			parts.push({ type: "text", text: textParts.join("\n") })
		}
		parts.push(...imageParts)
		return { content: parts, hasImages: true }
	}

	return { content: textParts.join("\n"), hasImages: false }
}

/**
 * Merge text content with the previous user message if possible, or add a new one
 */
function mergeOrAddUserMessage(content: string, result: Message[]): void {
	const lastMessage = result[result.length - 1]

	if (lastMessage?.role === "user") {
		// Merge with previous user message
		if (typeof lastMessage.content === "string") {
			lastMessage.content = lastMessage.content + "\n" + content
		} else if (Array.isArray(lastMessage.content)) {
			// Previous message has array content - add text to it
			lastMessage.content.push({ type: "text", text: content })
		}
	} else {
		// Add new user message
		result.push({ role: "user", content })
	}
}

/**
 * Merge array content (with images) with the previous user message if possible, or add a new one
 */
function mergeOrAddUserMessageWithArrayContent(
	content: (ContentPartText | ContentPartImage)[],
	result: Message[],
): void {
	const lastMessage = result[result.length - 1]

	if (lastMessage?.role === "user") {
		// Merge with previous user message
		if (typeof lastMessage.content === "string") {
			// Convert string to array and append new content
			lastMessage.content = [{ type: "text", text: lastMessage.content }, ...content]
		} else if (Array.isArray(lastMessage.content)) {
			// Previous message has array content - append new content
			lastMessage.content.push(...content)
		}
	} else {
		// Add new user message
		result.push({ role: "user", content })
	}
}

/**
 * Merge text content with the previous assistant message if possible, or add a new one
 */
function mergeOrAddAssistantMessage(
	content: string | undefined,
	toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined,
	result: Message[],
): void {
	const lastMessage = result[result.length - 1]
	const hasContent = content !== undefined

	// Can only merge if there are no tool_calls and the previous message is an assistant without tool_calls
	if (
		lastMessage?.role === "assistant" &&
		!toolCalls &&
		!(lastMessage as AssistantMessage).tool_calls &&
		hasContent &&
		content // Only merge non-empty content
	) {
		// Merge with previous assistant message
		if (typeof lastMessage.content === "string") {
			lastMessage.content = lastMessage.content + "\n" + content
		} else if (lastMessage.content === null || lastMessage.content === undefined) {
			lastMessage.content = content
		}
	} else if (hasContent || toolCalls) {
		// Add new assistant message (including empty string content)
		const assistantMessage: AssistantMessage = {
			role: "assistant",
			content: content ?? null,
			...(toolCalls && toolCalls.length > 0 && { tool_calls: toolCalls }),
		}
		result.push(assistantMessage)
	}
}
