import { deepSeekModels, deepSeekDefaultModelId, deepSeekModelAliases } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"

/**
 * Maps a user-provided model ID to the official DeepSeek API model name.
 * The DeepSeek API uses specific model names (deepseek-chat, deepseek-reasoner),
 * but users may use alternative names like deepseek-v3, deepseek-3.2, etc.
 */
function getApiModelId(modelId: string): string {
	return deepSeekModelAliases[modelId] ?? modelId
}

export class DeepSeekHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		const userModelId = options.apiModelId ?? deepSeekDefaultModelId
		// Map the user's model ID to the official API model name
		const apiModelId = getApiModelId(userModelId)

		super({
			...options,
			openAiApiKey: options.deepSeekApiKey ?? "not-provided",
			openAiModelId: apiModelId, // Use the mapped API model ID
			openAiBaseUrl: options.deepSeekBaseUrl ?? "https://api.deepseek.com",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})

		// Store the original user model ID for getModel()
		this.userModelId = userModelId
	}

	// Store the user's original model ID (before alias mapping)
	private userModelId: string

	override getModel() {
		// Use the user's original model ID for info lookup (so they see the model they selected)
		const id = this.userModelId
		const info = deepSeekModels[id as keyof typeof deepSeekModels] || deepSeekModels[deepSeekDefaultModelId]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle DeepSeek's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.prompt_tokens_details?.cache_miss_tokens,
			cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens,
		}
	}
}
