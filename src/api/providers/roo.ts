import { Anthropic } from "@anthropic-ai/sdk"
import { rooDefaultModelId, rooModels, type RooModelId } from "@roo-code/types"
import { CloudService } from "@roo-code/cloud"
import { randomUUID } from "crypto"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { t } from "../../i18n"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { ApiHandlerCreateMessageMetadata } from "../index"
import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class RooHandler extends BaseOpenAiCompatibleProvider<RooModelId> {
	private sessionId: string

	constructor(options: ApiHandlerOptions) {
		// Check if CloudService is available and get the session token.
		if (!CloudService.hasInstance()) {
			throw new Error(t("common:errors.roo.authenticationRequired"))
		}

		const sessionToken = CloudService.instance.authService?.getSessionToken()

		if (!sessionToken) {
			throw new Error(t("common:errors.roo.authenticationRequired"))
		}

		// Generate a unique session ID for this handler instance to ensure request isolation
		const sessionId = randomUUID()

		super({
			...options,
			providerName: "Roo Code Cloud",
			baseURL: process.env.ROO_CODE_PROVIDER_URL ?? "https://api.roocode.com/proxy/v1",
			apiKey: sessionToken,
			defaultProviderModelId: rooDefaultModelId,
			providerModels: rooModels,
			defaultTemperature: 0.7,
		})

		this.sessionId = sessionId
	}

	protected override createStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	) {
		const {
			id: model,
			info: { maxTokens: max_tokens },
		} = this.getModel()

		// Generate unique request ID for this specific request
		const requestId = randomUUID()

		// Create the request with session isolation metadata
		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model,
			max_tokens,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
			// Add session isolation metadata to prevent context mixing
			metadata: {
				session_id: this.sessionId,
				request_id: requestId,
				timestamp: new Date().toISOString(),
			} as any,
		}

		// Only include temperature if explicitly set
		if (this.options.modelTemperature !== undefined) {
			params.temperature = this.options.modelTemperature
		}

		// Create the stream with additional headers for session isolation
		return this.client.chat.completions.create(params, {
			headers: {
				"X-Session-Id": this.sessionId,
				"X-Request-Id": requestId,
				"X-No-Cache": "true", // Prevent any server-side caching
				"Cache-Control": "no-store, no-cache, must-revalidate",
				Pragma: "no-cache",
			},
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

			if (delta) {
				if (delta.content) {
					yield {
						type: "text",
						text: delta.content,
					}
				}

				if ("reasoning_content" in delta && typeof delta.reasoning_content === "string") {
					yield {
						type: "reasoning",
						text: delta.reasoning_content,
					}
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
	}

	override getModel() {
		const modelId = this.options.apiModelId || rooDefaultModelId
		const modelInfo = this.providerModels[modelId as RooModelId] ?? this.providerModels[rooDefaultModelId]

		if (modelInfo) {
			return { id: modelId as RooModelId, info: modelInfo }
		}

		// Return the requested model ID even if not found, with fallback info.
		// Note: supportsPromptCache is now false to prevent context mixing
		return {
			id: modelId as RooModelId,
			info: {
				maxTokens: 16_384,
				contextWindow: 262_144,
				supportsImages: false,
				supportsPromptCache: false, // Disabled to prevent context mixing
				inputPrice: 0,
				outputPrice: 0,
			},
		}
	}
}
