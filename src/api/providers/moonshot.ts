import OpenAI from "openai"
import { moonshotModels, moonshotDefaultModelId, type ModelInfo } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAIChatCompletionsHandler } from "./openai-chat-completions"

export class MoonshotHandler extends OpenAIChatCompletionsHandler {
	private moonshotOptions: ApiHandlerOptions

	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.moonshotApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? moonshotDefaultModelId,
			openAiBaseUrl: options.moonshotBaseUrl ?? "https://api.moonshot.ai/v1",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
		this.moonshotOptions = options
	}

	override getModel() {
		const id = this.moonshotOptions.apiModelId ?? moonshotDefaultModelId
		const info = moonshotModels[id as keyof typeof moonshotModels] || moonshotModels[moonshotDefaultModelId]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.moonshotOptions })
		return { id, info, ...params }
	}

	// Override to handle Moonshot's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: 0,
			cacheReadTokens: usage?.cached_tokens,
		}
	}

	// Override to always include max_tokens for Moonshot (not max_completion_tokens)
	protected override addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Moonshot uses max_tokens instead of max_completion_tokens
		requestOptions.max_tokens = this.moonshotOptions.modelMaxTokens || modelInfo.maxTokens
	}
}
