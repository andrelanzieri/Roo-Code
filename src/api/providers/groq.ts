import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { type GroqModelId, groqDefaultModelId, groqModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream } from "../transform/stream"
import { GroqCacheStrategy } from "../transform/cache-strategy/groq"
import { ModelInfo as CacheModelInfo } from "../transform/cache-strategy/types"
import { convertToOpenAiMessages } from "../transform/openai-format"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class GroqHandler extends BaseOpenAiCompatibleProvider<GroqModelId> {
	// Store conversation cache state for maintaining consistency
	private conversationCacheState: Map<string, any> = new Map()

	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Groq",
			baseURL: "https://api.groq.com/openai/v1",
			apiKey: options.groqApiKey,
			defaultProviderModelId: groqDefaultModelId,
			providerModels: groqModels,
			defaultTemperature: 0.5,
		})
	}

	// Override createStream to apply caching strategy
	protected override createStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
		requestOptions?: OpenAI.RequestOptions,
	) {
		const { id: model, info: modelInfo } = this.getModel()

		// Check if prompt caching is enabled for this model
		const usePromptCache = Boolean(this.options.groqUsePromptCache && modelInfo.supportsPromptCache)

		let formattedMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]

		if (usePromptCache) {
			// Use cache strategy to format messages optimally
			const cacheModelInfo: CacheModelInfo = {
				maxTokens: modelInfo.maxTokens || 8192,
				contextWindow: modelInfo.contextWindow || 131072,
				supportsPromptCache: modelInfo.supportsPromptCache || false,
				maxCachePoints: 4, // Groq doesn't use explicit cache points, but we set a reasonable default
				minTokensPerCachePoint: 1024, // Groq caches automatically, but we use this for tracking
				cachableFields: ["system", "messages"], // Groq can cache both
			}

			// Generate a conversation ID for cache tracking
			const conversationId = this.generateConversationId(messages)

			const cacheStrategy = new GroqCacheStrategy({
				modelInfo: cacheModelInfo,
				systemPrompt,
				messages,
				usePromptCache,
				previousCachePointPlacements: this.conversationCacheState.get(conversationId),
			})

			const cacheResult = cacheStrategy.determineOptimalCachePoints()

			// Store cache state for next request
			if (cacheResult.messageCachePointPlacements) {
				this.conversationCacheState.set(conversationId, cacheResult.messageCachePointPlacements)
			}

			// Convert to OpenAI format using the cache strategy
			formattedMessages = cacheStrategy.convertToOpenAIFormat(systemPrompt, messages)
		} else {
			// Use default formatting without caching
			formattedMessages = this.formatMessagesDefault(systemPrompt, messages)
		}

		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model,
			max_tokens: modelInfo.maxTokens || 8192,
			messages: formattedMessages,
			stream: true,
			stream_options: { include_usage: true },
		}

		// Only include temperature if explicitly set
		if (this.options.modelTemperature !== undefined) {
			params.temperature = this.options.modelTemperature
		}

		return this.client.chat.completions.create(params, requestOptions)
	}

	// Helper method to format messages without caching
	private formatMessagesDefault(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
		const result: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []

		if (systemPrompt) {
			result.push({ role: "system", content: systemPrompt })
		}

		// Use the imported convertToOpenAiMessages function
		result.push(...convertToOpenAiMessages(messages))

		return result
	}

	// Generate a stable conversation ID for cache tracking
	private generateConversationId(messages: Anthropic.Messages.MessageParam[]): string {
		if (messages.length === 0) {
			return "empty_conversation"
		}

		// Use first message content as basis for ID (truncated for efficiency)
		const firstMessage = messages[0]
		const content = typeof firstMessage.content === "string" ? firstMessage.content : "complex_content"

		return `conv_${firstMessage.role}_${content.substring(0, 20).replace(/\s+/g, "_")}`
	}

	// Override to handle Groq's usage metrics, including caching
	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const stream = await this.createStream(systemPrompt, messages, metadata)

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				// Groq includes cached token information in prompt_tokens_details
				const promptTokens = chunk.usage.prompt_tokens || 0
				const completionTokens = chunk.usage.completion_tokens || 0

				// Check multiple possible locations for cached tokens
				// Groq may return cached tokens in different fields depending on API version
				const promptDetails = (chunk.usage as any).prompt_tokens_details || {}
				const cachedTokens =
					promptDetails.cached_tokens ||
					promptDetails.cache_read_input_tokens ||
					promptDetails.cache_tokens ||
					0

				// Calculate non-cached input tokens
				const nonCachedInputTokens = Math.max(0, promptTokens - cachedTokens)

				yield {
					type: "usage",
					inputTokens: nonCachedInputTokens,
					outputTokens: completionTokens,
					cacheWriteTokens: 0, // Groq doesn't track cache writes separately
					cacheReadTokens: cachedTokens,
				}
			}
		}
	}

	// Clean up old conversation cache entries periodically
	private cleanupCacheState() {
		// Keep only the last 100 conversations to prevent memory growth
		if (this.conversationCacheState.size > 100) {
			const entries = Array.from(this.conversationCacheState.entries())
			const toKeep = entries.slice(-50) // Keep the last 50
			this.conversationCacheState = new Map(toKeep)
		}
	}
}
