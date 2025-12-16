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
 * @param messages Array of Anthropic messages
 * @returns Array of OpenAI messages where consecutive messages with the same role are combined
 */
export function convertToR1Format(messages: AnthropicMessage[]): Message[] {
	const result: Message[] = []

	for (const message of messages) {
		// Handle array content (may contain tool_use, tool_result, text, image)
		if (Array.isArray(message.content)) {
			if (message.role === "user") {
				// Separate tool_result blocks from other content
				const toolResults: Anthropic.ToolResultBlockParam[] = []
				const nonToolContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

				message.content.forEach((part) => {
					if (part.type === "tool_result") {
						toolResults.push(part)
					} else if (part.type === "text" || part.type === "image") {
						nonToolContent.push(part)
					}
				})

				// Process tool result messages - these become "tool" role messages
				toolResults.forEach((toolResult) => {
					let content: string
					if (typeof toolResult.content === "string") {
						content = toolResult.content
					} else {
						content =
							toolResult.content
								?.map((part) => {
									if (part.type === "image") {
										return "(see following user message for image)"
									}
									return part.text
								})
								.join("\n") ?? ""
					}

					const toolMessage: ToolMessage = {
						role: "tool",
						tool_call_id: toolResult.tool_use_id,
						content: content,
					}
					result.push(toolMessage)
				})

				// Process non-tool content
				if (nonToolContent.length > 0) {
					const messageContent = convertUserContent(nonToolContent)
					addOrMergeMessage(result, "user", messageContent)
				}
			} else if (message.role === "assistant") {
				// Separate tool_use blocks from other content
				const toolUses: Anthropic.ToolUseBlockParam[] = []
				const nonToolContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []

				message.content.forEach((part) => {
					if (part.type === "tool_use") {
						toolUses.push(part)
					} else if (part.type === "text" || part.type === "image") {
						nonToolContent.push(part)
					}
				})

				// Build assistant message with optional tool_calls
				let textContent: string | undefined
				if (nonToolContent.length > 0) {
					textContent = nonToolContent
						.map((part) => {
							if (part.type === "image") {
								return "" // assistant cannot send images
							}
							return part.text
						})
						.join("\n")
				}

				const toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined =
					toolUses.length > 0
						? toolUses.map((toolUse) => ({
								id: toolUse.id,
								type: "function" as const,
								function: {
									name: toolUse.name,
									arguments: JSON.stringify(toolUse.input),
								},
							}))
						: undefined

				// If we have tool_calls, we can't merge with previous message
				if (toolCalls) {
					const assistantMessage: AssistantMessage = {
						role: "assistant",
						content: textContent,
						tool_calls: toolCalls,
					}
					result.push(assistantMessage)
				} else if (textContent !== undefined) {
					addOrMergeMessage(result, "assistant", textContent)
				}
			}
		} else {
			// Simple string content
			addOrMergeMessage(result, message.role, message.content)
		}
	}

	return result
}

/**
 * Converts Anthropic user content blocks to OpenAI format
 */
function convertUserContent(
	content: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[],
): string | (ContentPartText | ContentPartImage)[] {
	const textParts: string[] = []
	const imageParts: ContentPartImage[] = []
	let hasImages = false

	content.forEach((part) => {
		if (part.type === "text") {
			textParts.push(part.text)
		}
		if (part.type === "image") {
			hasImages = true
			imageParts.push({
				type: "image_url",
				image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
			})
		}
	})

	if (hasImages) {
		const parts: (ContentPartText | ContentPartImage)[] = []
		if (textParts.length > 0) {
			parts.push({ type: "text", text: textParts.join("\n") })
		}
		parts.push(...imageParts)
		return parts
	}

	return textParts.join("\n")
}

/**
 * Adds a message to the result array, merging with the last message if roles match
 */
function addOrMergeMessage(
	result: Message[],
	role: "user" | "assistant",
	content: string | (ContentPartText | ContentPartImage)[],
): void {
	const lastMessage = result[result.length - 1]

	// Can only merge if last message has same role and no tool_calls
	if (lastMessage?.role === role && !("tool_calls" in lastMessage && lastMessage.tool_calls)) {
		if (typeof lastMessage.content === "string" && typeof content === "string") {
			lastMessage.content += `\n${content}`
		} else {
			// If either has image content, convert both to array format
			const lastContent = Array.isArray(lastMessage.content)
				? lastMessage.content
				: [{ type: "text" as const, text: lastMessage.content || "" }]

			const newContent = Array.isArray(content) ? content : [{ type: "text" as const, text: content }]

			if (role === "assistant") {
				const mergedContent = [...lastContent, ...newContent] as AssistantMessage["content"]
				lastMessage.content = mergedContent
			} else {
				const mergedContent = [...lastContent, ...newContent] as UserMessage["content"]
				lastMessage.content = mergedContent
			}
		}
	} else {
		// Add as new message
		if (role === "assistant") {
			const newMessage: AssistantMessage = {
				role: "assistant",
				content: content as AssistantMessage["content"],
			}
			result.push(newMessage)
		} else {
			const newMessage: UserMessage = {
				role: "user",
				content: content as UserMessage["content"],
			}
			result.push(newMessage)
		}
	}
}
