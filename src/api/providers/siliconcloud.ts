import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import {
	type SiliconCloudModelId,
	siliconCloudDefaultModelId,
	siliconCloudModelsByApiLine,
	siliconCloudApiLineConfigs,
	type SiliconCloudApiLine,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { ApiHandlerCreateMessageMetadata, SingleCompletionHandler } from "../index"
import { BaseProvider } from "./base-provider"
import { DEFAULT_HEADERS } from "./constants"
import { handleOpenAIError } from "./utils/openai-error-handler"

const SILICONCLOUD_DEFAULT_TEMPERATURE = 0

export class SiliconCloudHandler extends BaseProvider implements SingleCompletionHandler {
	private client: OpenAI
	private options: ApiHandlerOptions
	private apiLine: SiliconCloudApiLine
	private models: Record<string, any>

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.apiLine = options.siliconCloudApiLine || "china"
		this.models = siliconCloudModelsByApiLine[this.apiLine]

		const apiKey = options.siliconCloudApiKey
		if (!apiKey) {
			throw new Error("SiliconCloud API key is required")
		}

		const config = siliconCloudApiLineConfigs[this.apiLine]
		this.client = new OpenAI({
			baseURL: config.baseUrl,
			apiKey,
			defaultHeaders: DEFAULT_HEADERS,
		})
	}

	override getModel() {
		const id = (this.options.apiModelId as SiliconCloudModelId) || siliconCloudDefaultModelId
		const info = this.models[id] || this.models[siliconCloudDefaultModelId]
		return { id, info }
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const {
			id: model,
			info: { maxTokens: max_tokens, supportsReasoningBudget },
		} = this.getModel()

		const temperature = this.options.modelTemperature ?? SILICONCLOUD_DEFAULT_TEMPERATURE

		// Build the request parameters
		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model,
			max_tokens,
			temperature,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		}

		// Add SiliconCloud-specific reasoning parameters if the model supports it
		// Note: For now, we enable thinking by default for models that support it
		// In the future, this could be configurable via UI settings
		if (supportsReasoningBudget) {
			// SiliconCloud uses different parameter names than OpenAI
			;(params as any).enable_thinking = true
			// Default thinking budget could be added here if needed
		}

		try {
			const stream = await this.client.chat.completions.create(params)

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta

				if (delta?.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}

				if (chunk.usage) {
					yield {
						type: "usage",
						inputTokens: chunk.usage.prompt_tokens || 0,
						outputTokens: chunk.usage.completion_tokens || 0,
					}
				}
			}
		} catch (error) {
			throw handleOpenAIError(error, "SiliconCloud")
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		const { id: modelId } = this.getModel()

		try {
			const response = await this.client.chat.completions.create({
				model: modelId,
				messages: [{ role: "user", content: prompt }],
			})

			return response.choices[0]?.message.content || ""
		} catch (error) {
			throw handleOpenAIError(error, "SiliconCloud")
		}
	}
}
