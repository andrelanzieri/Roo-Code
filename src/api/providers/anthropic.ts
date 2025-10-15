import { Anthropic } from "@anthropic-ai/sdk"
import { Stream as AnthropicStream } from "@anthropic-ai/sdk/streaming"
import { CacheControlEphemeral } from "@anthropic-ai/sdk/resources"
import delay from "delay"

import {
	type ModelInfo,
	type AnthropicModelId,
	anthropicDefaultModelId,
	anthropicModels,
	ANTHROPIC_DEFAULT_MAX_TOKENS,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { calculateApiCostAnthropic } from "../../shared/cost"

// Batch API types
interface BatchRequest {
	custom_id: string
	params: Anthropic.Messages.MessageCreateParams
}

interface BatchJob {
	id: string
	status: "creating" | "processing" | "ended" | "canceling" | "canceled" | "expired" | "failed"
	created_at: string
	processing_began_at?: string
	ended_at?: string
	error?: {
		type: string
		message: string
	}
}

interface BatchResult {
	custom_id: string
	result: {
		type: "succeeded" | "failed" | "canceled" | "expired"
		message?: Anthropic.Message
		error?: {
			type: string
			message: string
		}
	}
}

export class AnthropicHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private client: Anthropic
	private static readonly BATCH_POLLING_INTERVAL = 20000 // 20 seconds
	private static readonly BATCH_TIMEOUT = 10 * 60 * 1000 // 10 minutes

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		const apiKeyFieldName =
			this.options.anthropicBaseUrl && this.options.anthropicUseAuthToken ? "authToken" : "apiKey"

		this.client = new Anthropic({
			baseURL: this.options.anthropicBaseUrl || undefined,
			[apiKeyFieldName]: this.options.apiKey,
		})
	}

	/**
	 * Creates a batch job for processing messages asynchronously
	 */
	private async createBatchJob(requests: BatchRequest[]): Promise<string> {
		const response = await fetch(`${this.client.baseURL || "https://api.anthropic.com"}/v1/messages/batches`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": this.options.apiKey || "",
				"anthropic-version": "2023-06-01",
				"anthropic-beta": "message-batches-2024-09-24",
			},
			body: JSON.stringify({ requests }),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Failed to create batch job: ${error}`)
		}

		const job: BatchJob = await response.json()
		return job.id
	}

	/**
	 * Polls for batch job status
	 */
	private async getBatchJobStatus(jobId: string): Promise<BatchJob> {
		const response = await fetch(
			`${this.client.baseURL || "https://api.anthropic.com"}/v1/messages/batches/${jobId}`,
			{
				method: "GET",
				headers: {
					"x-api-key": this.options.apiKey || "",
					"anthropic-version": "2023-06-01",
					"anthropic-beta": "message-batches-2024-09-24",
				},
			},
		)

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Failed to get batch job status: ${error}`)
		}

		return response.json()
	}

	/**
	 * Retrieves batch job results
	 */
	private async getBatchResults(jobId: string): Promise<BatchResult[]> {
		const response = await fetch(
			`${this.client.baseURL || "https://api.anthropic.com"}/v1/messages/batches/${jobId}/results`,
			{
				method: "GET",
				headers: {
					"x-api-key": this.options.apiKey || "",
					"anthropic-version": "2023-06-01",
					"anthropic-beta": "message-batches-2024-09-24",
				},
			},
		)

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Failed to get batch results: ${error}`)
		}

		const data = await response.json()
		return data.results || []
	}

	/**
	 * Process message using batch API with polling
	 */
	private async *processBatchMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		modelId: string,
		maxTokens: number | undefined,
		temperature: number | undefined,
		thinking: any,
	): ApiStream {
		// Create batch request
		const batchRequest: BatchRequest = {
			custom_id: `req_${Date.now()}`,
			params: {
				model: modelId,
				max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
				temperature,
				system: systemPrompt,
				messages,
			},
		}

		// Add thinking parameter if applicable
		if (thinking !== undefined) {
			;(batchRequest.params as any).thinking = thinking
		}

		// Create batch job
		yield { type: "text", text: "Creating batch job for processing (50% cost savings)...\n" }
		const jobId = await this.createBatchJob([batchRequest])

		// Poll for completion
		const startTime = Date.now()
		let lastUpdateTime = startTime
		let job: BatchJob

		while (true) {
			// Check for timeout
			if (Date.now() - startTime > AnthropicHandler.BATCH_TIMEOUT) {
				throw new Error("Batch job timed out after 10 minutes")
			}

			job = await this.getBatchJobStatus(jobId)

			// Update progress every 20 seconds
			const now = Date.now()
			if (now - lastUpdateTime >= AnthropicHandler.BATCH_POLLING_INTERVAL) {
				const elapsed = Math.floor((now - startTime) / 1000)
				yield {
					type: "text",
					text: `[Batch API] Processing... (${elapsed}s elapsed, status: ${job.status})\n`,
				}
				lastUpdateTime = now
			}

			if (job.status === "ended") {
				break
			} else if (job.status === "failed" || job.status === "canceled" || job.status === "expired") {
				throw new Error(`Batch job ${job.status}: ${job.error?.message || "Unknown error"}`)
			}

			// Wait before next poll
			await delay(5000) // Poll every 5 seconds internally, but only show updates every 20s
		}

		// Get results
		yield { type: "text", text: "Retrieving batch results...\n\n" }
		const results = await this.getBatchResults(jobId)

		if (results.length === 0) {
			throw new Error("No results returned from batch job")
		}

		const result = results[0]
		if (result.result.type !== "succeeded" || !result.result.message) {
			throw new Error(`Batch request failed: ${result.result.error?.message || "Unknown error"}`)
		}

		const message = result.result.message

		// Extract content from the message
		for (const content of message.content) {
			if (content.type === "text") {
				yield { type: "text", text: content.text }
			}
		}

		// Calculate and report usage (with 50% discount)
		const usage = message.usage
		if (usage) {
			const { input_tokens = 0, output_tokens = 0 } = usage
			const modelInfo = this.getModel().info

			// Calculate cost with 50% discount for batch API
			const baseCost = calculateApiCostAnthropic(
				modelInfo,
				input_tokens,
				output_tokens,
				0, // No cache writes for batch API
				0, // No cache reads for batch API
			)

			const discountedCost = baseCost * 0.5

			yield {
				type: "usage",
				inputTokens: input_tokens,
				outputTokens: output_tokens,
				totalCost: discountedCost,
			}
		}
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		let { id: modelId, betas = [], maxTokens, temperature, reasoning: thinking } = this.getModel()

		// Add 1M context beta flag if enabled for Claude Sonnet 4 and 4.5
		if (
			(modelId === "claude-sonnet-4-20250514" || modelId === "claude-sonnet-4-5") &&
			this.options.anthropicBeta1MContext
		) {
			betas.push("context-1m-2025-08-07")
		}

		// Use batch API if enabled
		if (this.options.anthropicUseBatchApi) {
			yield* this.processBatchMessage(systemPrompt, messages, modelId, maxTokens, temperature, thinking)
			return
		}

		// Regular streaming implementation
		let stream: AnthropicStream<Anthropic.Messages.RawMessageStreamEvent>
		const cacheControl: CacheControlEphemeral = { type: "ephemeral" }

		switch (modelId) {
			case "claude-sonnet-4-5":
			case "claude-sonnet-4-20250514":
			case "claude-opus-4-1-20250805":
			case "claude-opus-4-20250514":
			case "claude-3-7-sonnet-20250219":
			case "claude-3-5-sonnet-20241022":
			case "claude-3-5-haiku-20241022":
			case "claude-3-opus-20240229":
			case "claude-3-haiku-20240307": {
				/**
				 * The latest message will be the new user message, one before
				 * will be the assistant message from a previous request, and
				 * the user message before that will be a previously cached user
				 * message. So we need to mark the latest user message as
				 * ephemeral to cache it for the next request, and mark the
				 * second to last user message as ephemeral to let the server
				 * know the last message to retrieve from the cache for the
				 * current request.
				 */
				const userMsgIndices = messages.reduce(
					(acc, msg, index) => (msg.role === "user" ? [...acc, index] : acc),
					[] as number[],
				)

				const lastUserMsgIndex = userMsgIndices[userMsgIndices.length - 1] ?? -1
				const secondLastMsgUserIndex = userMsgIndices[userMsgIndices.length - 2] ?? -1

				stream = await this.client.messages.create(
					{
						model: modelId,
						max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
						temperature,
						thinking,
						// Setting cache breakpoint for system prompt so new tasks can reuse it.
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
					(() => {
						// prompt caching: https://x.com/alexalbert__/status/1823751995901272068
						// https://github.com/anthropics/anthropic-sdk-typescript?tab=readme-ov-file#default-headers
						// https://github.com/anthropics/anthropic-sdk-typescript/commit/c920b77fc67bd839bfeb6716ceab9d7c9bbe7393

						// Then check for models that support prompt caching
						switch (modelId) {
							case "claude-sonnet-4-5":
							case "claude-sonnet-4-20250514":
							case "claude-opus-4-1-20250805":
							case "claude-opus-4-20250514":
							case "claude-3-7-sonnet-20250219":
							case "claude-3-5-sonnet-20241022":
							case "claude-3-5-haiku-20241022":
							case "claude-3-opus-20240229":
							case "claude-3-haiku-20240307":
								betas.push("prompt-caching-2024-07-31")
								return { headers: { "anthropic-beta": betas.join(",") } }
							default:
								return undefined
						}
					})(),
				)
				break
			}
			default: {
				stream = (await this.client.messages.create({
					model: modelId,
					max_tokens: maxTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
					temperature,
					system: [{ text: systemPrompt, type: "text" }],
					messages,
					stream: true,
				})) as any
				break
			}
		}

		let inputTokens = 0
		let outputTokens = 0
		let cacheWriteTokens = 0
		let cacheReadTokens = 0

		for await (const chunk of stream) {
			switch (chunk.type) {
				case "message_start": {
					// Tells us cache reads/writes/input/output.
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
					// Tells us stop_reason, stop_sequence, and output tokens
					// along the way and at the end of the message.
					yield {
						type: "usage",
						inputTokens: 0,
						outputTokens: chunk.usage.output_tokens || 0,
					}

					break
				case "message_stop":
					// No usage data, just an indicator that the message is done.
					break
				case "content_block_start":
					switch (chunk.content_block.type) {
						case "thinking":
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
							if (chunk.index > 0) {
								yield { type: "reasoning", text: "\n" }
							}

							yield { type: "reasoning", text: chunk.content_block.thinking }
							break
						case "text":
							// We may receive multiple text blocks, in which
							// case just insert a line break between them.
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

		if (inputTokens > 0 || outputTokens > 0 || cacheWriteTokens > 0 || cacheReadTokens > 0) {
			yield {
				type: "usage",
				inputTokens: 0,
				outputTokens: 0,
				totalCost: calculateApiCostAnthropic(
					this.getModel().info,
					inputTokens,
					outputTokens,
					cacheWriteTokens,
					cacheReadTokens,
				),
			}
		}
	}

	getModel() {
		const modelId = this.options.apiModelId
		let id = modelId && modelId in anthropicModels ? (modelId as AnthropicModelId) : anthropicDefaultModelId
		let info: ModelInfo = anthropicModels[id]

		// If 1M context beta is enabled for Claude Sonnet 4 or 4.5, update the model info
		if ((id === "claude-sonnet-4-20250514" || id === "claude-sonnet-4-5") && this.options.anthropicBeta1MContext) {
			// Use the tier pricing for 1M context
			const tier = info.tiers?.[0]
			if (tier) {
				info = {
					...info,
					contextWindow: tier.contextWindow,
					inputPrice: tier.inputPrice,
					outputPrice: tier.outputPrice,
					cacheWritesPrice: tier.cacheWritesPrice,
					cacheReadsPrice: tier.cacheReadsPrice,
				}
			}
		}

		const params = getModelParams({
			format: "anthropic",
			modelId: id,
			model: info,
			settings: this.options,
		})

		// The `:thinking` suffix indicates that the model is a "Hybrid"
		// reasoning model and that reasoning is required to be enabled.
		// The actual model ID honored by Anthropic's API does not have this
		// suffix.
		return {
			id: id === "claude-3-7-sonnet-20250219:thinking" ? "claude-3-7-sonnet-20250219" : id,
			info,
			betas: id === "claude-3-7-sonnet-20250219:thinking" ? ["output-128k-2025-02-19"] : undefined,
			...params,
		}
	}

	async completePrompt(prompt: string) {
		let { id: model, temperature } = this.getModel()

		const message = await this.client.messages.create({
			model,
			max_tokens: ANTHROPIC_DEFAULT_MAX_TOKENS,
			thinking: undefined,
			temperature,
			messages: [{ role: "user", content: prompt }],
			stream: false,
		})

		const content = message.content.find(({ type }) => type === "text")
		return content?.type === "text" ? content.text : ""
	}

	/**
	 * Counts tokens for the given content using Anthropic's API
	 *
	 * @param content The content blocks to count tokens for
	 * @returns A promise resolving to the token count
	 */
	override async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		try {
			// Use the current model
			const { id: model } = this.getModel()

			const response = await this.client.messages.countTokens({
				model,
				messages: [{ role: "user", content: content }],
			})

			return response.input_tokens
		} catch (error) {
			// Log error but fallback to tiktoken estimation
			console.warn("Anthropic token counting failed, using fallback", error)

			// Use the base provider's implementation as fallback
			return super.countTokens(content)
		}
	}
}
