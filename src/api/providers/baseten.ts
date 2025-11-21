import { type BasetenModelId, basetenDefaultModelId, basetenModels } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"
import type { ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
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

		let lastUsage: OpenAI.CompletionUsage | undefined

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta

			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield { type: "reasoning", text: (delta.reasoning_content as string | undefined) || "" }
			}

			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		if (lastUsage) {
			yield this.processUsageMetrics(lastUsage)
		}
	}

	protected processUsageMetrics(usage: any): ApiStreamUsageChunk {
		const inputTokens = usage?.prompt_tokens || 0
		const outputTokens = usage?.completion_tokens || 0
		const cacheWriteTokens = usage?.prompt_tokens_details?.cache_write_tokens || 0
		const cacheReadTokens = usage?.prompt_tokens_details?.cached_tokens || 0

		const { totalCost } = calculateApiCostOpenAI(
			this.getModel().info,
			inputTokens,
			outputTokens,
			cacheWriteTokens,
			cacheReadTokens,
		)

		return {
			type: "usage",
			inputTokens,
			outputTokens,
			cacheWriteTokens: cacheWriteTokens || undefined,
			cacheReadTokens: cacheReadTokens || undefined,
			totalCost,
		}
	}
}
