import type { ModelInfo } from "../model.js"

// Codex CLI models - mirrors OpenAI models since it's OpenAI-compatible
export type CodexCliModelId =
	| "gpt-4o"
	| "gpt-4o-mini"
	| "gpt-4-turbo"
	| "gpt-4"
	| "gpt-3.5-turbo"
	| "o1-preview"
	| "o1-mini"
	| "o1"
	| "o3-mini"

export const codexCliDefaultModelId: CodexCliModelId = "gpt-4o-mini"

export const codexCliModels: Record<CodexCliModelId, ModelInfo> = {
	"gpt-4o": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 2.5,
		outputPrice: 10,
	},
	"gpt-4o-mini": {
		maxTokens: 16384,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.6,
	},
	"gpt-4-turbo": {
		maxTokens: 4096,
		contextWindow: 128000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 10,
		outputPrice: 30,
	},
	"gpt-4": {
		maxTokens: 8192,
		contextWindow: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 30,
		outputPrice: 60,
	},
	"gpt-3.5-turbo": {
		maxTokens: 4096,
		contextWindow: 16385,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.5,
	},
	"o1-preview": {
		maxTokens: 32768,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 15,
		outputPrice: 60,
	},
	"o1-mini": {
		maxTokens: 65536,
		contextWindow: 128000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 3,
		outputPrice: 12,
	},
	o1: {
		maxTokens: 100000,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 15,
		outputPrice: 60,
	},
	"o3-mini": {
		maxTokens: 65536,
		contextWindow: 200000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.1,
		outputPrice: 4.4,
		reasoningEffort: "medium",
	},
}
