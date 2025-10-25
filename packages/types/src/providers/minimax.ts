import type { ModelInfo } from "../model.js"

// https://docs.minimaxi.com/docs/api
export type MiniMaxModelId = keyof typeof miniMaxModels

export const miniMaxDefaultModelId: MiniMaxModelId = "abab5.5s-chat"

export const miniMaxModels = {
	"abab5.5s-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 5, // $5 per million tokens
		outputPrice: 15, // $15 per million tokens
		description: `MiniMax-M2 is a high-performance model optimized for coding, reasoning, and general AI-assisted development tasks. It offers strong capabilities in code generation, debugging, and technical problem-solving.`,
	},
	"abab6.5s-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 245_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 10, // $10 per million tokens
		outputPrice: 30, // $30 per million tokens
		description: `MiniMax-M2 Pro is an advanced version with extended context window and enhanced reasoning capabilities, ideal for complex coding projects and comprehensive code analysis.`,
	},
	"abab6.5g-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 245_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 10, // $10 per million tokens
		outputPrice: 30, // $30 per million tokens
		description: `MiniMax-M2 Vision adds multimodal capabilities to the Pro model, supporting image understanding alongside code generation and reasoning tasks.`,
	},
} as const satisfies Record<string, ModelInfo>
