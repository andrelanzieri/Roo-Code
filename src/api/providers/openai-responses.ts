import { Anthropic } from "@anthropic-ai/sdk"

import {
	type ModelInfo,
	type ServiceTier,
	OPENAI_NATIVE_DEFAULT_TEMPERATURE,
	GPT5_DEFAULT_TEMPERATURE,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { calculateApiCostOpenAI } from "../../shared/cost"

import { OpenAIBaseHandler } from "./openai-base"
import type { ApiHandlerCreateMessageMetadata } from "../index"

/**
 * Handler for OpenAI Responses API
 * Handles the new Responses API with specialized streaming/response parsing
 * This is a simplified implementation focusing on the core Responses API functionality
 */
export class OpenAIResponsesHandler extends OpenAIBaseHandler {
	private lastResponseId: string | undefined
	private lastServiceTier: ServiceTier | undefined

	constructor(options: ApiHandlerOptions) {
		super(options, "OpenAI Responses")
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Reset resolved tier for this request
		this.lastServiceTier = undefined

		const model = this.getModel()
		const modelId = model.id

		// Prepare the request body for Responses API
		const requestBody = this.buildRequestBody(model, systemPrompt, messages, metadata)

		// Make the request
		yield* this.executeRequest(requestBody, model)
	}

	private buildRequestBody(
		model: any,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): any {
		// Format the conversation for Responses API
		const formattedInput = this.formatConversation(systemPrompt, messages, metadata)

		const requestBody: any = {
			model: model.id,
			input: formattedInput,
			stream: true,
			store: metadata?.store !== false, // Default to true unless explicitly set to false
			instructions: systemPrompt,
		}

		// Add temperature if supported
		if (model.info.supportsTemperature !== false) {
			requestBody.temperature =
				this.options.modelTemperature ??
				(model.id.startsWith("gpt-5") ? GPT5_DEFAULT_TEMPERATURE : OPENAI_NATIVE_DEFAULT_TEMPERATURE)
		}

		// Add max output tokens if available
		if (model.maxTokens) {
			requestBody.max_output_tokens = model.maxTokens
		}

		// Add previous response ID if available for conversation continuity
		if (this.lastResponseId && !metadata?.suppressPreviousResponseId) {
			requestBody.previous_response_id = this.lastResponseId
		}

		return requestBody
	}

	private formatConversation(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): any[] {
		// If we have a previous response ID and not suppressed, only send the latest user message
		if (this.lastResponseId && !metadata?.suppressPreviousResponseId) {
			const lastUserMessage = [...messages].reverse().find((msg) => msg.role === "user")
			if (lastUserMessage) {
				return [this.formatMessage(lastUserMessage)]
			}
		}

		// Otherwise, format the full conversation
		const formattedMessages: any[] = []

		for (const message of messages) {
			formattedMessages.push(this.formatMessage(message))
		}

		return formattedMessages
	}

	private formatMessage(message: Anthropic.Messages.MessageParam): any {
		const role = message.role === "user" ? "user" : "assistant"
		const content: any[] = []

		if (typeof message.content === "string") {
			// Use input_text for user messages, output_text for assistant
			if (role === "user") {
				content.push({ type: "input_text", text: message.content })
			} else {
				content.push({ type: "output_text", text: message.content })
			}
		} else if (Array.isArray(message.content)) {
			for (const block of message.content) {
				if (block.type === "text") {
					if (role === "user") {
						content.push({ type: "input_text", text: (block as any).text })
					} else {
						content.push({ type: "output_text", text: (block as any).text })
					}
				} else if (block.type === "image") {
					const image = block as Anthropic.Messages.ImageBlockParam
					const imageUrl = `data:${image.source.media_type};base64,${image.source.data}`
					content.push({ type: "input_image", image_url: imageUrl })
				}
			}
		}

		return { role, content }
	}

	private async *executeRequest(requestBody: any, model: any): ApiStream {
		try {
			// Use the SDK's Responses API if available
			const responsesApi = (this.client as any).responses
			if (responsesApi && typeof responsesApi.create === "function") {
				const stream = await responsesApi.create(requestBody)

				if (typeof (stream as any)[Symbol.asyncIterator] === "function") {
					for await (const event of stream) {
						yield* this.processEvent(event, model)
					}
					return
				}
			}

			// Fallback to direct API call if SDK doesn't support Responses API
			yield* this.makeDirectApiCall(requestBody, model)
		} catch (error: any) {
			// Handle previous_response_id not found error
			if (error?.status === 400 && requestBody.previous_response_id) {
				// Clear the stored lastResponseId and retry without it
				this.lastResponseId = undefined
				delete requestBody.previous_response_id

				// Retry the request
				try {
					const responsesApi = (this.client as any).responses
					if (responsesApi && typeof responsesApi.create === "function") {
						const stream = await responsesApi.create(requestBody)
						if (typeof (stream as any)[Symbol.asyncIterator] === "function") {
							for await (const event of stream) {
								yield* this.processEvent(event, model)
							}
							return
						}
					}
					yield* this.makeDirectApiCall(requestBody, model)
				} catch (retryError) {
					this.handleError(retryError)
				}
			} else {
				this.handleError(error)
			}
		}
	}

	private async *makeDirectApiCall(requestBody: any, model: any): ApiStream {
		const apiKey = this.options.openAiApiKey ?? "not-provided"
		const baseUrl = this.options.openAiBaseUrl || "https://api.openai.com"
		const url = `${baseUrl}/v1/responses`

		try {
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
					Accept: "text/event-stream",
				},
				body: JSON.stringify(requestBody),
			})

			if (!response.ok) {
				const errorText = await response.text()
				throw new Error(`Responses API error (${response.status}): ${errorText}`)
			}

			if (!response.body) {
				throw new Error("Responses API error: No response body")
			}

			// Handle streaming response
			yield* this.handleStreamResponse(response.body, model)
		} catch (error) {
			this.handleError(error)
		}
	}

	private async *handleStreamResponse(body: ReadableStream<Uint8Array>, model: any): ApiStream {
		const reader = body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break

				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() || ""

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).trim()
						if (data === "[DONE]") {
							continue
						}

						try {
							const parsed = JSON.parse(data)
							yield* this.processEvent(parsed, model)
						} catch (e) {
							// Ignore JSON parsing errors
							if (!(e instanceof SyntaxError)) {
								throw e
							}
						}
					}
				}
			}
		} finally {
			reader.releaseLock()
		}
	}

	private async *processEvent(event: any, model: any): ApiStream {
		// Store response ID for conversation continuity
		if (event?.response?.id) {
			this.lastResponseId = event.response.id
		}

		// Capture resolved service tier
		if (event?.response?.service_tier) {
			this.lastServiceTier = event.response.service_tier as ServiceTier
		}

		// Handle text deltas
		if (event?.type === "response.text.delta" || event?.type === "response.output_text.delta") {
			if (event?.delta) {
				yield { type: "text", text: event.delta }
			}
			return
		}

		// Handle reasoning deltas
		if (
			event?.type === "response.reasoning.delta" ||
			event?.type === "response.reasoning_text.delta" ||
			event?.type === "response.reasoning_summary.delta" ||
			event?.type === "response.reasoning_summary_text.delta"
		) {
			if (event?.delta) {
				yield { type: "reasoning", text: event.delta }
			}
			return
		}

		// Handle refusal deltas
		if (event?.type === "response.refusal.delta") {
			if (event?.delta) {
				yield { type: "text", text: `[Refusal] ${event.delta}` }
			}
			return
		}

		// Handle output item additions
		if (event?.type === "response.output_item.added") {
			const item = event?.item
			if (item) {
				if (item.type === "text" && item.text) {
					yield { type: "text", text: item.text }
				} else if (item.type === "reasoning" && item.text) {
					yield { type: "reasoning", text: item.text }
				} else if (item.type === "message" && Array.isArray(item.content)) {
					for (const content of item.content) {
						if ((content?.type === "text" || content?.type === "output_text") && content?.text) {
							yield { type: "text", text: content.text }
						}
					}
				}
			}
			return
		}

		// Handle completion events with usage
		if (event?.type === "response.done" || event?.type === "response.completed") {
			const usage = event?.response?.usage || event?.usage
			if (usage) {
				yield this.normalizeUsage(usage, model)
			}
			return
		}

		// Handle complete response in initial event (non-streaming format)
		if (event.response && event.response.output && Array.isArray(event.response.output)) {
			for (const outputItem of event.response.output) {
				if (outputItem.type === "text" && outputItem.content) {
					for (const content of outputItem.content) {
						if (content.type === "text" && content.text) {
							yield { type: "text", text: content.text }
						}
					}
				}
				// Handle reasoning summaries
				if (outputItem.type === "reasoning" && Array.isArray(outputItem.summary)) {
					for (const summary of outputItem.summary) {
						if (summary?.type === "summary_text" && typeof summary.text === "string") {
							yield { type: "reasoning", text: summary.text }
						}
					}
				}
			}
			// Check for usage in the complete response
			if (event.response.usage) {
				yield this.normalizeUsage(event.response.usage, model)
			}
		}
	}

	private normalizeUsage(usage: any, model: any): ApiStreamUsageChunk {
		if (!usage) {
			return {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
			}
		}

		const inputDetails = usage.input_tokens_details ?? usage.prompt_tokens_details
		const cachedFromDetails = inputDetails?.cached_tokens ?? 0
		const missFromDetails = inputDetails?.cache_miss_tokens ?? 0

		let totalInputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0
		if (totalInputTokens === 0 && inputDetails && (cachedFromDetails > 0 || missFromDetails > 0)) {
			totalInputTokens = cachedFromDetails + missFromDetails
		}

		const totalOutputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0
		const cacheWriteTokens = usage.cache_creation_input_tokens ?? usage.cache_write_tokens ?? 0
		const cacheReadTokens =
			usage.cache_read_input_tokens ?? usage.cache_read_tokens ?? usage.cached_tokens ?? cachedFromDetails ?? 0

		// Calculate cost if we have pricing info
		const effectiveTier = this.lastServiceTier || undefined
		const effectiveInfo = this.applyServiceTierPricing(model.info, effectiveTier)

		const totalCost = calculateApiCostOpenAI(
			effectiveInfo,
			totalInputTokens,
			totalOutputTokens,
			cacheWriteTokens,
			cacheReadTokens,
		)

		const reasoningTokens =
			typeof usage.output_tokens_details?.reasoning_tokens === "number"
				? usage.output_tokens_details.reasoning_tokens
				: undefined

		return {
			type: "usage",
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			cacheWriteTokens,
			cacheReadTokens,
			...(typeof reasoningTokens === "number" ? { reasoningTokens } : {}),
			totalCost,
		}
	}

	private applyServiceTierPricing(info: ModelInfo, tier?: ServiceTier): ModelInfo {
		if (!tier || tier === "default") return info

		const tierInfo = info.tiers?.find((t) => t.name === tier)
		if (!tierInfo) return info

		return {
			...info,
			inputPrice: tierInfo.inputPrice ?? info.inputPrice,
			outputPrice: tierInfo.outputPrice ?? info.outputPrice,
			cacheReadsPrice: tierInfo.cacheReadsPrice ?? info.cacheReadsPrice,
			cacheWritesPrice: tierInfo.cacheWritesPrice ?? info.cacheWritesPrice,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const model = this.getModel()

			const requestBody: any = {
				model: model.id,
				input: [
					{
						role: "user",
						content: [{ type: "input_text", text: prompt }],
					},
				],
				stream: false,
				store: false,
			}

			// Add temperature if supported
			if (model.info.supportsTemperature !== false) {
				requestBody.temperature =
					this.options.modelTemperature ??
					(model.id.startsWith("gpt-5") ? GPT5_DEFAULT_TEMPERATURE : OPENAI_NATIVE_DEFAULT_TEMPERATURE)
			}

			// Add max output tokens if available
			if (model.maxTokens) {
				requestBody.max_output_tokens = model.maxTokens
			}

			// Make the non-streaming request
			const responsesApi = (this.client as any).responses
			if (responsesApi && typeof responsesApi.create === "function") {
				const response = await responsesApi.create(requestBody)

				// Extract text from the response
				if (response?.output && Array.isArray(response.output)) {
					for (const outputItem of response.output) {
						if (outputItem.type === "message" && outputItem.content) {
							for (const content of outputItem.content) {
								if (content.type === "output_text" && content.text) {
									return content.text
								}
							}
						}
					}
				}

				// Fallback: check for direct text in response
				if (response?.text) {
					return response.text
				}
			}

			return ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`${this.providerName} completion error: ${error.message}`)
			}
			throw error
		}
	}

	/**
	 * Gets the last response ID for conversation continuity
	 */
	getLastResponseId(): string | undefined {
		return this.lastResponseId
	}

	/**
	 * Sets the response ID for conversation continuity
	 */
	setResponseId(responseId: string): void {
		this.lastResponseId = responseId
	}
}
