import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"

import { DEFAULT_HEADERS } from "./constants"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import type { ApiHandlerOptions } from "../../shared/api"
import { ApiStream } from "../transform/stream"

import { OpenAIChatCompletionsHandler } from "./openai-chat-completions"
import { OpenAIResponsesHandler } from "./openai-responses"

/**
 * Main OpenAI handler that routes requests to either Chat Completions or Responses API
 * based on URL pattern detection and configuration.
 *
 * This handler acts as a router, automatically detecting which API to use based on:
 * - URL patterns (e.g., /v1/responses for Responses API)
 * - Model configuration (e.g., GPT-5 models prefer Responses API)
 * - Explicit configuration flags
 */
export class OpenAiHandler implements SingleCompletionHandler {
	private handler: OpenAIChatCompletionsHandler | OpenAIResponsesHandler
	private readonly useResponsesApi: boolean

	constructor(options: ApiHandlerOptions) {
		// Determine which API to use based on configuration and URL patterns
		this.useResponsesApi = this.shouldUseResponsesApi(options)

		// Create the appropriate handler
		if (this.useResponsesApi) {
			this.handler = new OpenAIResponsesHandler(options)
		} else {
			this.handler = new OpenAIChatCompletionsHandler(options)
		}
	}

	/**
	 * Determines whether to use the Responses API based on URL patterns and configuration
	 */
	private shouldUseResponsesApi(options: ApiHandlerOptions): boolean {
		// Check URL pattern for /v1/responses endpoint
		const baseUrl = options.openAiBaseUrl ?? ""
		if (baseUrl.includes("/v1/responses") || baseUrl.endsWith("/responses")) {
			return true
		}

		// Check if it's a GPT-5 model (which should use Responses API)
		const modelId = options.openAiModelId ?? ""
		if (modelId.startsWith("gpt-5")) {
			return true
		}

		// Check if it's configured for OpenAI Native (which uses Responses API)
		if (options.openAiNativeApiKey && !options.openAiApiKey) {
			return true
		}

		// Default to Chat Completions API for backward compatibility
		return false
	}

	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		yield* this.handler.createMessage(systemPrompt, messages, metadata)
	}

	getModel() {
		return this.handler.getModel()
	}

	async completePrompt(prompt: string): Promise<string> {
		return this.handler.completePrompt(prompt)
	}

	/**
	 * Count tokens for the given content
	 */
	async countTokens(content: any[]): Promise<number> {
		return this.handler.countTokens(content)
	}

	/**
	 * Get information about which API is being used
	 */
	getApiType(): "chat-completions" | "responses" {
		return this.useResponsesApi ? "responses" : "chat-completions"
	}

	/**
	 * For Responses API, get the last response ID for conversation continuity
	 */
	getLastResponseId(): string | undefined {
		if (this.handler instanceof OpenAIResponsesHandler) {
			return this.handler.getLastResponseId()
		}
		return undefined
	}

	/**
	 * For Responses API, set the response ID for conversation continuity
	 */
	setResponseId(responseId: string): void {
		if (this.handler instanceof OpenAIResponsesHandler) {
			this.handler.setResponseId(responseId)
		}
	}
}

export async function getOpenAiModels(baseUrl?: string, apiKey?: string, openAiHeaders?: Record<string, string>) {
	try {
		if (!baseUrl) {
			return []
		}

		// Trim whitespace from baseUrl to handle cases where users accidentally include spaces
		const trimmedBaseUrl = baseUrl.trim()

		if (!URL.canParse(trimmedBaseUrl)) {
			return []
		}

		const config: Record<string, any> = {}
		const headers: Record<string, string> = {
			...DEFAULT_HEADERS,
			...(openAiHeaders || {}),
		}

		if (apiKey) {
			headers["Authorization"] = `Bearer ${apiKey}`
		}

		if (Object.keys(headers).length > 0) {
			config["headers"] = headers
		}

		const response = await axios.get(`${trimmedBaseUrl}/models`, config)
		const modelsArray = response.data?.data?.map((model: any) => model.id) || []
		return [...new Set<string>(modelsArray)]
	} catch (error) {
		return []
	}
}
