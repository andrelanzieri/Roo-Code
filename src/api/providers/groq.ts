import { Anthropic } from "@anthropic-ai/sdk"

import { type GroqModelId, groqDefaultModelId, groqModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream } from "../transform/stream"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class GroqHandler extends BaseOpenAiCompatibleProvider<GroqModelId> {
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
				const cachedTokens = (chunk.usage as any).prompt_tokens_details?.cached_tokens || 0

				// Calculate non-cached input tokens
				const nonCachedInputTokens = Math.max(0, promptTokens - cachedTokens)

				yield {
					type: "usage",
					inputTokens: nonCachedInputTokens,
					outputTokens: completionTokens,
					cacheWriteTokens: 0, // Groq doesn't track cache writes
					cacheReadTokens: cachedTokens,
				}
			}
		}
	}
}
