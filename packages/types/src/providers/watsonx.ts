import type { ModelInfo } from "../model.js"

export type WatsonxAIModelId = keyof typeof watsonxAiModels
export const watsonxAiDefaultModelId = ""

// Common model properties
export const baseModelInfo: ModelInfo = {
	maxTokens: 131072,
	contextWindow: 131072,
	supportsImages: false,
	supportsPromptCache: false,
	supportsReasoningEffort: true,
	supportsReasoningBudget: false,
	requiredReasoningBudget: false,
	inputPrice: 5.22,
	outputPrice: 5.22,
}

export const watsonxAiModels = {
	// IBM Granite model
	"ibm/granite-3-3-8b-instruct": {
		...baseModelInfo,
		description: "",
	},
} as const satisfies Record<string, ModelInfo>
