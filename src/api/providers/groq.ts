import { type GroqModelId, type ModelInfo, groqDefaultModelId, groqModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class GroqHandler extends BaseOpenAiCompatibleProvider<GroqModelId> {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			providerName: "Groq",
			baseURL: "https://api.groq.com/openai/v1",
			apiKey: options.groqApiKey,
			defaultProviderModelId: groqDefaultModelId,
			providerModels: groqModels,
			defaultTemperature: 0.5,
		})
	}

	protected override getCustomModelInfo(): ModelInfo | undefined {
		return this.options.groqCustomModelInfo ?? undefined
	}
}
