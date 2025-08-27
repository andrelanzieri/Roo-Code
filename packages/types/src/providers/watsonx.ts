import type { ModelInfo } from "../model.js"

export type WatsonxAIModelId = keyof typeof watsonxAiModels
export const watsonxAiDefaultModelId: WatsonxAIModelId = "ibm/granite-3-3-8b-instruct"

// Common model properties
export const baseModelInfo: ModelInfo = {
	maxTokens: 4096,
	contextWindow: 128000,
	supportsImages: false,
	supportsPromptCache: true,
	supportsReasoningEffort: false,
	supportsReasoningBudget: false,
	requiredReasoningBudget: false,
	inputPrice: 0,
	outputPrice: 0,
}

export const watsonxAiModels = {
	// IBM Granite model
	"ibm/granite-3-3-8b-instruct": {
		...baseModelInfo,
		description: "Granite 3.3 8b Instruct - IBM-trained, dense decoder-only model",
	},
	"ibm/granite-3-2-8b-instruct": {
		...baseModelInfo,
		description: "Granite 3.2 8b Instruct - Text-only model capable of reasoning",
	},
	"ibm/granite-3-2b-instruct": {
		...baseModelInfo,
		description: "Granite 3 2b Instruct - IBM-trained, dense decoder-only model",
	},
	"ibm/granite-3-8b-instruct": {
		...baseModelInfo,
		description: "Granite 3 8b Instruct - IBM-trained, dense decoder-only model",
	},
	"ibm/granite-guardian-3-2b": {
		...baseModelInfo,
		description: "Granite Guardian 3 2b - IBM-trained, dense decoder-only model",
	},
	"ibm/granite-guardian-3-8b": {
		...baseModelInfo,
		description: "Granite Guardian 3 8b - IBM-trained, dense decoder-only model",
	},
	"ibm/granite-vision-3-2-2b": {
		...baseModelInfo,
		supportsImages: true,
		description: "Granite 3 Vision - Image-text, text-out model capable of understanding images",
	},
	// Meta Llama models
	"meta-llama/llama-3-2-11b-vision-instruct": {
		...baseModelInfo,
		supportsImages: true,
		description: "Llama 3 2 11b Vision Instruct - Auto-regressive language model with transformer architecture",
	},
	"meta-llama/llama-3-2-1b-instruct": {
		...baseModelInfo,
		description: "Llama 3 2 1b Instruct - Auto-regressive language model with transformer architecture",
	},
	"meta-llama/llama-3-2-3b-instruct": {
		...baseModelInfo,
		description: "Llama 3 2 3b Instruct - Auto-regressive language model with transformer architecture",
	},
	"meta-llama/llama-3-2-90b-vision-instruct": {
		...baseModelInfo,
		supportsImages: true,
		description: "Llama 3 2 90b Vision Instruct - Auto-regressive language model with transformer architecture",
	},
	"meta-llama/llama-3-3-70b-instruct": {
		...baseModelInfo,
		description: "Llama 3 3 70b Instruct - FP8 quantized version of the original FP16 weights",
	},
	"meta-llama/llama-3-405b-instruct": {
		...baseModelInfo,
		contextWindow: 128000,
		description: "Llama 3 405b Instruct - Meta's largest open-source foundation model with 405 billion parameters",
	},
	"meta-llama/llama-4-maverick-17b-1-0": {
		...baseModelInfo,
		contextWindow: 128000,
		description: "Llama 4 Maverick - 17 billion active parameter model with 128 experts",
	},
	"meta-llama/llama-guard-3-11b-vision": {
		...baseModelInfo,
		supportsImages: true,
		description: "Llama Guard 3 11b Vision - Auto-regressive language model with transformer architecture",
	},
	// Mistral AI models
	"mistralai/mistral-medium-2505": {
		...baseModelInfo,
		description: "Mistral Medium - Latest iteration of the Mistral Medium model family",
	},
	"mistralai/mistral-small-3-1-24b-instruct-2503": {
		...baseModelInfo,
		description: "Mistral Small 3.1 24B Base 2503 - Instruction-finetuned version of Mistral Small",
	},
} as const satisfies Record<string, ModelInfo>
