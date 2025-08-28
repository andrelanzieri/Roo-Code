import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import type { ModelInfo } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"
import { convertToOpenAiMessages } from "../transform/openai-format"

import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"

type BaseOpenAiCompatibleProviderOptions<ModelName extends string> = ApiHandlerOptions & {
	providerName: string
	baseURL: string
	defaultProviderModelId: ModelName
	providerModels: Record<ModelName, ModelInfo>
	defaultTemperature?: number
}

export abstract class BaseOpenAiCompatibleProvider<ModelName extends string>
	extends BaseProvider
	implements SingleCompletionHandler
{
	protected readonly providerName: string
	protected readonly baseURL: string
	protected readonly defaultTemperature: number
	protected readonly defaultProviderModelId: ModelName
	protected readonly providerModels: Record<ModelName, ModelInfo>

	protected readonly options: ApiHandlerOptions

	protected client: OpenAI

	constructor({
		providerName,
		baseURL,
		defaultProviderModelId,
		providerModels,
		defaultTemperature,
		...options
	}: BaseOpenAiCompatibleProviderOptions<ModelName>) {
		super()

		this.providerName = providerName
		this.baseURL = baseURL
		this.defaultProviderModelId = defaultProviderModelId
		this.providerModels = providerModels
		this.defaultTemperature = defaultTemperature ?? 0

		this.options = options

		if (!this.options.apiKey) {
			throw new Error("API key is required")
		}

		this.client = new OpenAI({
			baseURL,
			apiKey: this.options.apiKey,
			defaultHeaders: DEFAULT_HEADERS,
		})
	}

	protected createStream(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
		requestOptions?: OpenAI.RequestOptions,
	) {
		const {
			id: model,
			info: { maxTokens: max_tokens },
		} = this.getModel()

		const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model,
			max_tokens,
			messages: [{ role: "system", content: systemPrompt }, ...convertToOpenAiMessages(messages)],
			stream: true,
			stream_options: { include_usage: true },
		}

		// Only include temperature if explicitly set
		if (this.options.modelTemperature !== undefined) {
			params.temperature = this.options.modelTemperature
		}

		return this.client.chat.completions.create(params, requestOptions)
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		try {
			const stream = await this.createStream(systemPrompt, messages, metadata)

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
			// Enhance error messages for OpenAI Compatible providers
			const enhancedError = this.enhanceErrorMessage(error)
			throw enhancedError
		}
	}

	/**
	 * Enhances error messages with helpful guidance for OpenAI Compatible API issues
	 */
	private enhanceErrorMessage(error: any): Error {
		const baseUrl = this.baseURL
		const modelId = this.options.apiModelId || this.defaultProviderModelId

		let errorMessage = error?.message || "Unknown error occurred"
		let suggestions: string[] = []

		// Check for common error patterns
		if (error?.status === 401 || errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
			suggestions.push("• Verify your API key is correct and has proper permissions")
			suggestions.push("• Check if the API key format matches your provider's requirements")
		} else if (error?.status === 404 || errorMessage.includes("404") || errorMessage.includes("Not Found")) {
			suggestions.push(`• Verify the base URL is correct: ${baseUrl}`)
			suggestions.push(`• Check if the model '${modelId}' is available on your provider`)
			suggestions.push("• Ensure the API endpoint path is correct (some providers use /v1, others don't)")
		} else if (error?.status === 429 || errorMessage.includes("429") || errorMessage.includes("rate limit")) {
			suggestions.push("• You've hit the rate limit for this API")
			suggestions.push("• Wait a moment before retrying")
			suggestions.push("• Consider upgrading your API plan for higher limits")
		} else if (error?.status === 500 || error?.status === 502 || error?.status === 503) {
			suggestions.push("• The API server is experiencing issues")
			suggestions.push("• Try again in a few moments")
			suggestions.push("• Check your provider's status page for outages")
		} else if (errorMessage.includes("ECONNREFUSED") || errorMessage.includes("ENOTFOUND")) {
			suggestions.push(`• Cannot connect to ${baseUrl}`)
			suggestions.push("• Verify the server is running and accessible")
			suggestions.push("• Check your network connection and firewall settings")
		} else if (errorMessage.includes("timeout") || errorMessage.includes("ETIMEDOUT")) {
			suggestions.push("• The request timed out")
			suggestions.push("• The server might be overloaded or the model is taking too long to respond")
			suggestions.push("• Try with a simpler request or a different model")
		} else if (errorMessage.includes("model") && errorMessage.includes("not")) {
			suggestions.push(`• The model '${modelId}' may not be available`)
			suggestions.push("• Check the available models for your provider")
			suggestions.push("• Try using a different model")
		}

		// Add general suggestions if no specific ones were added
		if (suggestions.length === 0) {
			suggestions.push("• Verify your API configuration (base URL, API key, model)")
			suggestions.push("• Check if the provider service is operational")
			suggestions.push("• Try breaking down your request into smaller parts")
			suggestions.push("• Consult your provider's documentation for specific requirements")
		}

		// Create enhanced error message
		const enhancedMessage = `OpenAI Compatible API Error (${this.providerName}):\n${errorMessage}\n\nSuggestions to resolve:\n${suggestions.join("\n")}`

		const enhancedError = new Error(enhancedMessage)
		// Preserve original error properties
		if (error?.status) {
			;(enhancedError as any).status = error.status
		}
		if (error?.code) {
			;(enhancedError as any).code = error.code
		}

		return enhancedError
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
			// Use the same enhanced error handling
			throw this.enhanceErrorMessage(error)
		}
	}

	override getModel() {
		const id =
			this.options.apiModelId && this.options.apiModelId in this.providerModels
				? (this.options.apiModelId as ModelName)
				: this.defaultProviderModelId

		return { id, info: this.providerModels[id] }
	}
}
