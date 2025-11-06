import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"

import {
	type ModelInfo,
	type MinimaxModelId,
	minimaxDefaultModelId,
	minimaxModels,
	MINIMAX_DEFAULT_TEMPERATURE,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"

export class MiniMaxHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: Anthropic

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		if (!this.options.minimaxApiKey) {
			throw new Error("MiniMax API key is required")
		}

		// MiniMax supports Anthropic-compatible API
		// https://platform.minimax.io/docs/api-reference/text-anthropic-api
		this.client = new Anthropic({
			baseURL: this.options.minimaxBaseUrl || "https://api.minimax.io/v1",
			apiKey: this.options.minimaxApiKey,
		})
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId, info, maxTokens, temperature } = this.getModel()
		const cacheControl: CacheControlEphemeral = { type: "ephemeral" }

		// Check if the model supports prompt caching
		const supportsPromptCache = info.supportsPromptCache ?? false
		const betas: string[] = []

		if (supportsPromptCache) {
			betas.push("prompt-caching-2024-07-31")
		}

		let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>

		if (supportsPromptCache) {
			// With prompt caching support, handle cache control for user messages
			const userMsgIndices = messages.reduce(
				(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
				[] as number[],
			)

			const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
			const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

			stream = await this.client.messages.create(
				{
					model: modelId,
					max_tokens: maxTokens ?? 16384,
					temperature,
					// Setting cache breakpoint for system prompt so new tasks can reuse it
					system: [{ text: systemPrompt, type: "text", cache_control: cacheControl }],
					messages: messages.map((message, index) => {
						if (index === lastUserMsgIndex || index === secondLastMsgUserIndex) {
							return {
								...message,
								content:
									typeof message.content === "string"
										? [{ type: "text", text: message.content, cache_control: cacheControl }]
										: message.content.map((content, contentIndex) =>
												contentIndex === message.content.length - 1
													? { ...content, cache_control: cacheControl }
													: content,
											),
							}
						}
						return message
					}),
					stream: true,
				},
				betas.length > 0 ? { headers: { "anthropic-beta": betas.join(",") } } : undefined,
			)
		} else {
			// Without prompt caching
			stream = await this.client.messages.create({
				model: modelId,
				max_tokens: maxTokens ?? 16384,
				temperature,
				system: [{ text: systemPrompt, type: "text" }],
				messages,
				stream: true,
			})
		}

		let inputTokens = 0
		let outputTokens = 0
		let cacheWriteTokens = 0
		let cacheReadTokens = 0

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start": {
					// Tells us cache reads/writes/input/output
					const {
						input_tokens = 0,
						output_tokens = 0,
						cache_creation_input_tokens,
						cache_read_input_tokens,
					} = chunk.message.usage

					yield {
						type: "usage",
						inputTokens: input_tokens,
						outputTokens: output_tokens,
						cacheWriteTokens: cache_creation_input_tokens || undefined,
						cacheReadTokens: cache_read_input_tokens || undefined,
					}

					inputTokens += input_tokens
					outputTokens += output_tokens
					cacheWriteTokens += cache_creation_input_tokens || 0
					cacheReadTokens += cache_read_input_tokens || 0

					break
				}
				case "message_delta":
					// Tells us output tokens along the way and at the end of the message
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}
					break
				case "message_stop":
					// No usage data, just an indicator that the message is done
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "thinking":
							// Handle reasoning/thinking blocks if supported
							if (chunk.index > 0) {
								yield { type: "reasoning", text: "\n" }
							}
							yield { type: "reasoning", text: chunk.content_block.thinking }
							break
						case "text":
							// We may receive multiple text blocks
							if (chunk.index > 0) {
								yield { type: "text", text: "\n" }
							}
							yield { type: "text", text: chunk.content_block.text }
							break
					}
					break
				case "content_block_delta":
					switch (chunk.delta.type) {
						case "thinking_delta":
							yield { type: "reasoning", text: chunk.delta.thinking }
							break
						case "text_delta":
							yield { type: "text", text: chunk.delta.text }
							break
					}
					break
				case "content_block_stop":
					break
			}
		}

		// Calculate total cost if we have usage data
		if (inputTokens > 0 || outputTokens > 0 || cacheWriteTokens > 0 || cacheReadTokens > 0) {
			// MiniMax pricing (per million tokens):
			// Input: $0.3, Output: $1.2, Cache writes: $0.375, Cache reads: $0.03
			const inputCost = (inputTokens / 1_000_000) * (info.inputPrice || 0)
			const outputCost = (outputTokens / 1_000_000) * (info.outputPrice || 0)
			const cacheWriteCost = (cacheWriteTokens / 1_000_000) * (info.cacheWritesPrice || 0)
			const cacheReadCost = (cacheReadTokens / 1_000_000) * (info.cacheReadsPrice || 0)
			const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost

			yield {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
				totalCost,
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		const id = modelId && modelId in minimaxModels ? (modelId as MinimaxModelId) : minimaxDefaultModelId
		const info: ModelInfo = minimaxModels[id]

		const params = getModelParams({
			format: "anthropic",
			modelId: id,
			model: info,
			settings: this.options,
		})

		return {
			id,
			info,
			...params,
			temperature: this.options.modelTemperature ?? MINIMAX_DEFAULT_TEMPERATURE,
		}
	}

	async completePrompt(prompt: string) {
		const { id: model, temperature } = this.getModel()

		const message = await this.client.messages.create({
			model,
			max_tokens: 16384,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		})

		const content = message.content.find(({ type }) => type === "text")
		return content?.type === "text" ? content.text : ""
	}

	/**
	 * Counts tokens for the given content using MiniMax's Anthropic-compatible API
	 * Falls back to tiktoken estimation if the API doesn't support token counting
	 */
	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		try {
			// Try to use the API's token counting if available
			// Note: This might not be supported by MiniMax yet
			const { id: model } = this.getModel()

			// MiniMax might not have token counting endpoint yet
			// If they add it, it would follow Anthropic's pattern
			const response = await this.client.messages.countTokens({
				model,
				messages: [{ role: "user", content: content }],
			})

			return response.input_tokens
		} catch (error) {
			// Fallback to tiktoken estimation
			return super.countTokens(content)
		}
	}
}
