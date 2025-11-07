import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { type MinimaxModelId, minimaxDefaultModelId, minimaxModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { getModelMaxOutputTokens } from "../../shared/api"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { handleOpenAIError } from "./utils/openai-error-handler"
import type { ApiHandlerCreateMessageMetadata } from "../index"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class MiniMaxHandler extends BaseOpenAiCompatibleProvider<MinimaxModelId> {
	private readonly isChinaEndpoint: boolean

	constructor(options: ApiHandlerOptions) {
		const baseURL = options.minimaxBaseUrl ?? "https://api.minimax.io/v1"
		// Detect China endpoint by parsing the hostname
		// China endpoint uses different model IDs than international endpoint
		let isChinaEndpoint = false
		try {
			const url = new URL(baseURL)
			// Check for known China domains: minimaxi.com or minimax.com (as mentioned in issue)
			isChinaEndpoint = url.hostname.endsWith("minimaxi.com") || url.hostname.endsWith("minimax.com")
		} catch {
			// If URL parsing fails, fall back to simple check
			isChinaEndpoint = baseURL.includes("minimaxi.com")
		}

		super({
			...options,
			providerName: "MiniMax",
			baseURL,
			apiKey: options.minimaxApiKey,
			defaultProviderModelId: minimaxDefaultModelId,
			providerModels: minimaxModels,
			defaultTemperature: 1.0,
		})

		this.isChinaEndpoint = isChinaEndpoint
	}

	// Override createStream to handle model ID mapping for China endpoint
	protected override createStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
		requestOptions?: OpenAI.RequestOptions,
	) {
		const { id: modelId, info } = this.getModel()

		// Map model IDs for China endpoint - they use different model names
		let apiModelId = modelId as string
		if (this.isChinaEndpoint) {
			// China endpoint requires different model IDs than the international endpoint
			// MiniMax uses different naming conventions for their China-hosted models
			const chinaModelMapping: Record<string, string> = {
				"MiniMax-M2": "abab7-chat",
				"MiniMax-M2-Stable": "abab7-chat-hd",
			}
			apiModelId = chinaModelMapping[modelId] ?? modelId
		}

		// Centralized cap: clamp to 20% of the context window (unless provider-specific exceptions apply)
		const max_tokens =
			getModelMaxOutputTokens({
				modelId,
				model: info,
				settings: this.options,
				format: "openai",
			}) ?? undefined

		const temperature = this.options.modelTemperature ?? 1.0

		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: apiModelId,
			max_tokens,
			temperature,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		}

		try {
			return this.client.chat.completions.create(params, requestOptions)
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}
	}

	// Override completePrompt to handle model ID mapping for China endpoint
	override async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel()

		// Map model IDs for China endpoint
		let apiModelId = modelId as string
		if (this.isChinaEndpoint) {
			// China endpoint requires different model IDs than the international endpoint
			// MiniMax uses different naming conventions for their China-hosted models
			const chinaModelMapping: Record<string, string> = {
				"MiniMax-M2": "abab7-chat",
				"MiniMax-M2-Stable": "abab7-chat-hd",
			}
			apiModelId = chinaModelMapping[modelId] ?? modelId
		}

		try {
			const response = await this.client.chat.completions.create({
				model: apiModelId,
				messages: [{ role: "user", content: prompt }],
			})

			return response.choices[0]?.message.content || ""
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}
	}
}
