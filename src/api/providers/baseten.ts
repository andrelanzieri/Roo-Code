import { type BasetenModelId, basetenDefaultModelId, basetenModels } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream } from "../transform/stream"
import { calculateApiCostOpenAI } from "../../shared/cost"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class BasetenHandler extends BaseOpenAiCompatibleProvider<BasetenModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Baseten",
			baseURL: "https://inference.baseten.co/v1",
			apiKey: options.basetenApiKey,
			defaultProviderModelId: basetenDefaultModelId,
			providerModels: basetenModels,
			defaultTemperature: 0.5,
		})
	}

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
				// Check if usage has cached token details (some models support this)
				const usage = chunk.usage as any
				const inputTokens = usage?.prompt_tokens || 0
				const outputTokens = usage?.completion_tokens || 0

				// Check for cached tokens in various possible locations
				const cacheReadTokens =
					usage?.prompt_tokens_details?.cached_tokens || usage?.prompt_cache_hit_tokens || 0

				// Baseten currently doesn't track cache writes
				const cacheWriteTokens = 0

				// Calculate cost using OpenAI-compatible cost calculation
				const { totalCost } = calculateApiCostOpenAI(
					this.getModel().info,
					inputTokens,
					outputTokens,
					cacheWriteTokens,
					cacheReadTokens,
				)

				yield {
					type: "usage",
					inputTokens,
					outputTokens,
					cacheWriteTokens,
					cacheReadTokens,
					totalCost,
				}
			}
		}
	}
}
