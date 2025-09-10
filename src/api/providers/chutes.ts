import { DEEP_SEEK_DEFAULT_TEMPERATURE, type ChutesModelId, chutesDefaultModelId, chutesModels } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ApiHandlerOptions } from "../../shared/api"
import { XmlMatcher } from "../../utils/xml-matcher"
import { convertToR1Format } from "../transform/r1-format"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class ChutesHandler extends BaseOpenAiCompatibleProvider<ChutesModelId> {
	private retryCount = 3
	private retryDelay = 1000 // Start with 1 second delay

	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Chutes",
			baseURL: "https://llm.chutes.ai/v1",
			apiKey: options.chutesApiKey,
			defaultProviderModelId: chutesDefaultModelId,
			providerModels: chutesModels,
			defaultTemperature: 0.5,
		})
	}

	private getCompletionParams(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming {
		const {
			id: model,
			info: { maxTokens: max_tokens },
		} = this.getModel()

		const temperature = this.options.modelTemperature ?? this.getModel().info.temperature

		return {
			model,
			max_tokens,
			temperature,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		}
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		const model = this.getModel()

		// Add retry logic for transient errors
		let lastError: Error | null = null
		for (let attempt = 0; attempt < this.retryCount; attempt++) {
			try {
				if (model.id.includes("DeepSeek-R1")) {
					const stream = await this.client.chat.completions.create({
						...this.getCompletionParams(systemPrompt, messages),
						messages: convertToR1Format([{ role: "user", content: systemPrompt }, ...messages]),
					})

					const matcher = new XmlMatcher(
						"think",
						(chunk) =>
							({
								type: chunk.matched ? "reasoning" : "text",
								text: chunk.data,
							}) as const,
					)

					for await (const chunk of stream) {
						const delta = chunk.choices[0]?.delta

						if (delta?.content) {
							for (const processedChunk of matcher.update(delta.content)) {
								yield processedChunk
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

					// Process any remaining content
					for (const processedChunk of matcher.final()) {
						yield processedChunk
					}
					return // Success, exit the retry loop
				} else {
					yield* super.createMessage(systemPrompt, messages)
					return // Success, exit the retry loop
				}
			} catch (error: any) {
				lastError = error
				console.error(`ChutesAI API error (attempt ${attempt + 1}/${this.retryCount}):`, {
					status: error.status,
					message: error.message,
					response: error.response,
					cause: error.cause,
				})

				// Check if it's a retryable error (5xx errors)
				if (error.status && error.status >= 500 && error.status < 600 && attempt < this.retryCount - 1) {
					// Exponential backoff
					const delay = this.retryDelay * Math.pow(2, attempt)
					console.log(`Retrying ChutesAI request after ${delay}ms...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
					continue
				}

				// For non-retryable errors or final attempt, throw with more context
				const enhancedError = new Error(
					`ChutesAI API error (${error.status || "unknown status"}): ${error.message || "Empty response body"}. ` +
						`This may be a temporary issue with the ChutesAI service. ` +
						`Please verify your API key and try again.`,
				)
				;(enhancedError as any).status = error.status
				;(enhancedError as any).originalError = error
				throw enhancedError
			}
		}

		// If we've exhausted all retries
		if (lastError) {
			throw lastError
		}
	}

	override async completePrompt(prompt: string): Promise<string> {
		let lastError: Error | null = null

		for (let attempt = 0; attempt < this.retryCount; attempt++) {
			try {
				return await super.completePrompt(prompt)
			} catch (error: any) {
				lastError = error
				console.error(`ChutesAI completePrompt error (attempt ${attempt + 1}/${this.retryCount}):`, {
					status: error.status,
					message: error.message,
				})

				// Check if it's a retryable error (5xx errors)
				if (error.status && error.status >= 500 && error.status < 600 && attempt < this.retryCount - 1) {
					// Exponential backoff
					const delay = this.retryDelay * Math.pow(2, attempt)
					console.log(`Retrying ChutesAI completePrompt after ${delay}ms...`)
					await new Promise((resolve) => setTimeout(resolve, delay))
					continue
				}

				// For non-retryable errors or final attempt, throw with more context
				const enhancedError = new Error(
					`ChutesAI completion error (${error.status || "unknown status"}): ${error.message || "Empty response body"}. ` +
						`Please verify your API key and endpoint configuration.`,
				)
				;(enhancedError as any).status = error.status
				;(enhancedError as any).originalError = error
				throw enhancedError
			}
		}

		// If we've exhausted all retries
		if (lastError) {
			throw lastError
		}

		throw new Error("ChutesAI completion failed after all retry attempts")
	}

	override getModel() {
		const model = super.getModel()
		const isDeepSeekR1 = model.id.includes("DeepSeek-R1")
		return {
			...model,
			info: {
				...model.info,
				temperature: isDeepSeekR1 ? DEEP_SEEK_DEFAULT_TEMPERATURE : this.defaultTemperature,
			},
		}
	}
}
