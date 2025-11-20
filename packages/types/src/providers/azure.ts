import type { ModelInfo } from "../model.js"

// Azure AI models deployed via Azure AI Foundry and Azure OpenAI
export type AzureModelId = keyof typeof azureModels

export const azureDefaultModelId: AzureModelId = "claude-sonnet-4-5"

export const azureModels = {
	"claude-sonnet-4-5": {
		maxTokens: 64_000,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		supportsTemperature: true,
		description: "Claude Sonnet 4.5 on Azure AI Foundry - Extended thinking and vision capabilities",
	},
	"gpt-5-pro": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsNativeTools: true,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningEffort: ["high"],
		reasoningEffort: "high",
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		supportsTemperature: true,
		description: "GPT-5-Pro on Azure OpenAI - Most powerful for complex tasks with high reasoning effort",
	},
	"gpt-5.1": {
		maxTokens: 128_000,
		contextWindow: 400_000,
		supportsNativeTools: true,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningEffort: ["none", "low", "medium", "high"],
		reasoningEffort: "medium",
		inputPrice: 1.25,
		outputPrice: 10.0,
		cacheReadsPrice: 0.125,
		supportsVerbosity: true,
		supportsTemperature: false,
		description: "GPT-5.1 on Azure OpenAI - Adaptive reasoning with flexible effort levels",
	},
} as const satisfies Record<string, ModelInfo>
