import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI, { AzureOpenAI } from "openai"

import { type ModelInfo, azureOpenAiDefaultApiVersion, openAiModelInfoSaneDefaults } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { getApiRequestTimeout } from "./utils/timeout-config"
import { handleOpenAIError } from "./utils/openai-error-handler"
import { getModelParams } from "../transform/model-params"

/**
 * Base class for OpenAI-compatible providers with shared logic for auth, retry, metrics, and basic transforms.
 * This class contains common functionality that both Chat Completions and Responses API handlers can use.
 */
export abstract class OpenAIBaseHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	protected client: OpenAI
	protected readonly providerName: string

	constructor(options: ApiHandlerOptions, providerName: string = "OpenAI") {
		super()
		this.options = options
		this.providerName = providerName

		const baseURL = this.options.openAiBaseUrl ?? "https://api.openai.com/v1"
		const apiKey = this.options.openAiApiKey ?? "not-provided"
		const isAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)
		const urlHost = this._getUrlHost(this.options.openAiBaseUrl)
		const isAzureOpenAi = urlHost === "azure.com" || urlHost.endsWith(".azure.com") || options.openAiUseAzure

		const headers = {
			...DEFAULT_HEADERS,
			...(this.options.openAiHeaders || {}),
		}

		const timeout = getApiRequestTimeout()

		if (isAzureAiInference) {
			// Azure AI Inference Service (e.g., for DeepSeek) uses a different path structure
			this.client = new OpenAI({
				baseURL,
				apiKey,
				defaultHeaders: headers,
				defaultQuery: { "api-version": this.options.azureApiVersion || "2024-05-01-preview" },
				timeout,
			})
		} else if (isAzureOpenAi) {
			// Azure API shape slightly differs from the core API shape:
			// https://github.com/openai/openai-node?tab=readme-ov-file#microsoft-azure-openai
			this.client = new AzureOpenAI({
				baseURL,
				apiKey,
				apiVersion: this.options.azureApiVersion || azureOpenAiDefaultApiVersion,
				defaultHeaders: headers,
				timeout,
			})
		} else {
			this.client = new OpenAI({
				baseURL,
				apiKey,
				defaultHeaders: headers,
				timeout,
			})
		}
	}

	/**
	 * Get the model configuration with parameters
	 */
	override getModel() {
		const id = this.options.openAiModelId ?? ""
		const info = this.options.openAiCustomModelInfo ?? openAiModelInfoSaneDefaults
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	/**
	 * Complete a prompt using the appropriate API
	 */
	abstract completePrompt(prompt: string): Promise<string>

	/**
	 * Helper method to get the URL host
	 */
	protected _getUrlHost(baseUrl?: string): string {
		try {
			return new URL(baseUrl ?? "").host
		} catch (error) {
			return ""
		}
	}

	/**
	 * Check if the URL is for Grok xAI
	 */
	protected _isGrokXAI(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.includes("x.ai")
	}

	/**
	 * Check if the URL is for Azure AI Inference
	 */
	protected _isAzureAiInference(baseUrl?: string): boolean {
		const urlHost = this._getUrlHost(baseUrl)
		return urlHost.endsWith(".services.ai.azure.com")
	}

	/**
	 * Handle OpenAI errors with proper error messages
	 */
	protected handleError(error: any): never {
		throw handleOpenAIError(error, this.providerName)
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 * Note: max_tokens is deprecated in favor of max_completion_tokens as per OpenAI documentation
	 */
	protected addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.includeMaxTokens === true) {
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			// Using max_completion_tokens as max_tokens is deprecated
			requestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
		}
	}
}
