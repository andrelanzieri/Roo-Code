import type { ApiHandlerOptions } from "../../shared/api"
import type { ModelInfo } from "@roo-code/types"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

// Default model configuration for OpenAI-compatible APIs
const DEFAULT_OPENAI_COMPATIBLE_MODEL: ModelInfo = {
	maxTokens: 128000,
	contextWindow: 128000,
	supportsPromptCache: false,
	supportsImages: false,
	supportsReasoningEffort: false,
	supportsReasoningBinary: false,
	inputPrice: 0,
	outputPrice: 0,
}

// Support any model ID as string for maximum flexibility
export class OpenAiCompatibleHandler extends BaseOpenAiCompatibleProvider<string> {
	constructor(options: ApiHandlerOptions) {
		// Since ApiHandlerOptions doesn't have openAiCompatibleBaseUrl/ApiKey yet,
		// we'll use the openAiBaseUrl and openAiApiKey for now as a workaround
		// This will be properly fixed when we add the proper types
		const baseURL = (options as any).openAiCompatibleBaseUrl || options.openAiBaseUrl
		const apiKey = (options as any).openAiCompatibleApiKey || options.openAiApiKey

		if (!baseURL) {
			throw new Error("OpenAI-compatible base URL is required")
		}

		if (!apiKey) {
			throw new Error("OpenAI-compatible API key is required")
		}

		// Use the model ID provided or default to a generic one
		const modelId = options.apiModelId || "default"

		// Create a models object with the single model
		const providerModels: Record<string, ModelInfo> = {
			[modelId]: DEFAULT_OPENAI_COMPATIBLE_MODEL,
		}

		super({
			...options,
			providerName: "OpenAI Compatible",
			baseURL,
			apiKey,
			defaultProviderModelId: modelId,
			providerModels,
			defaultTemperature: 0.7,
		})
	}

	override getModel() {
		// For OpenAI-compatible APIs, we allow any model ID
		// and use default configuration if not known
		const modelId = this.options.apiModelId || "default"

		return {
			id: modelId,
			info: DEFAULT_OPENAI_COMPATIBLE_MODEL,
		}
	}
}
