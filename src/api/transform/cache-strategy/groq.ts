import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { CacheStrategy } from "./base-strategy"
import { CacheResult, CachePointPlacement, CacheStrategyConfig } from "./types"
import { SystemContentBlock, Message } from "@aws-sdk/client-bedrock-runtime"

/**
 * Groq-specific cache strategy implementation.
 *
 * Groq's caching works differently from Anthropic/Bedrock:
 * - Groq automatically caches message prefixes based on exact matches
 * - No explicit cache points are needed in the API request
 * - The API returns cache hit information in the usage response
 * - Caching is automatic for repeated message prefixes
 *
 * This strategy formats messages for optimal caching with Groq's automatic system.
 */
export class GroqCacheStrategy extends CacheStrategy {
	/**
	 * Determine optimal cache point placements for Groq.
	 * Since Groq handles caching automatically, we don't add explicit cache points.
	 * Instead, we ensure messages are formatted consistently for optimal cache hits.
	 */
	public determineOptimalCachePoints(): CacheResult {
		// Groq doesn't use explicit cache points, so we just return formatted messages
		const systemBlocks: SystemContentBlock[] = this.config.systemPrompt
			? [{ text: this.config.systemPrompt } as unknown as SystemContentBlock]
			: []

		const messages = this.messagesToContentBlocks(this.config.messages)

		// Track placements for consistency (even though Groq doesn't use them)
		const placements: CachePointPlacement[] = []

		// For Groq, we track which messages would be cached based on the prefix matching
		// This helps with monitoring and debugging
		if (this.config.usePromptCache && this.config.messages.length > 0) {
			// Groq caches message prefixes automatically
			// We can track the last user message as a "virtual" cache point for monitoring
			for (let i = this.config.messages.length - 1; i >= 0; i--) {
				if (this.config.messages[i].role === "user") {
					const tokenCount = this.estimateTokenCount(this.config.messages[i])
					if (this.meetsMinTokenThreshold(tokenCount)) {
						placements.push({
							index: i,
							type: "message",
							tokensCovered: tokenCount,
						})
					}
					break // Only track the last user message for Groq
				}
			}
		}

		return {
			system: systemBlocks,
			messages,
			messageCachePointPlacements: placements,
		}
	}

	/**
	 * Convert messages to OpenAI format for Groq.
	 * Groq uses OpenAI-compatible format.
	 */
	public convertToOpenAIFormat(
		systemPrompt: string | undefined,
		messages: Anthropic.Messages.MessageParam[],
	): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
		const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

		// Add system message if present
		if (systemPrompt) {
			result.push({
				role: "system",
				content: systemPrompt,
			})
		}

		// Convert messages to OpenAI format
		for (const message of messages) {
			if (message.role === "user") {
				// Handle user messages
				if (typeof message.content === "string") {
					result.push({
						role: "user",
						content: message.content,
					})
				} else if (Array.isArray(message.content)) {
					// Handle multi-part content
					const textParts = message.content
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n")

					if (textParts) {
						result.push({
							role: "user",
							content: textParts,
						})
					}
				}
			} else if (message.role === "assistant") {
				// Handle assistant messages
				if (typeof message.content === "string") {
					result.push({
						role: "assistant",
						content: message.content,
					})
				} else if (Array.isArray(message.content)) {
					// Handle multi-part content
					const textParts = message.content
						.filter((part) => part.type === "text")
						.map((part) => part.text)
						.join("\n")

					if (textParts) {
						result.push({
							role: "assistant",
							content: textParts,
						})
					}
				}
			}
		}

		return result
	}
}
