import { miniMaxModels, miniMaxDefaultModelId, MINIMAX_DEFAULT_TEMPERATURE } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"

export class MiniMaxHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.miniMaxApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? miniMaxDefaultModelId,
			openAiBaseUrl: options.miniMaxBaseUrl ?? "https://api.minimaxi.com/v1",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
	}

	override getModel() {
		const id = this.options.apiModelId ?? miniMaxDefaultModelId
		const info = miniMaxModels[id as keyof typeof miniMaxModels] || miniMaxModels[miniMaxDefaultModelId]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}
}
