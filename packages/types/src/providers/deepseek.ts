import type { ModelInfo } from "../model.js"

// https://platform.deepseek.com/docs/api
// DeepSeek Pricing Documentation: https://api-docs.deepseek.com/quick_start/pricing/
export type DeepSeekModelId = keyof typeof deepSeekModels

export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"

// Note: DeepSeek offers two pricing tiers based on time:
// - Standard Price (UTC 00:30-16:30): Current prices below
// - Discount Price (UTC 16:30-00:30): 50% off all prices
// The prices below reflect the Standard Price tier.
// Time-based pricing is not currently implemented in this system.
export const deepSeekModels = {
	"deepseek-chat": {
		maxTokens: 8192, // 8K max output
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.27, // $0.27 per million tokens (cache miss) - Standard Price
		outputPrice: 1.1, // $1.10 per million tokens - Standard Price
		cacheWritesPrice: 0.27, // $0.27 per million tokens (cache miss) - Standard Price
		cacheReadsPrice: 0.07, // $0.07 per million tokens (cache hit) - Standard Price
		description: `DeepSeek-V3 achieves a significant breakthrough in inference speed over previous models. It tops the leaderboard among open-source models and rivals the most advanced closed-source models globally.`,
	},
	"deepseek-reasoner": {
		maxTokens: 65536, // 64K max output for reasoning mode
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.55, // $0.55 per million tokens (cache miss) - Standard Price
		outputPrice: 2.19, // $2.19 per million tokens - Standard Price
		cacheWritesPrice: 0.55, // $0.55 per million tokens (cache miss) - Standard Price
		cacheReadsPrice: 0.14, // $0.14 per million tokens (cache hit) - Standard Price
		description: `DeepSeek-R1 achieves performance comparable to OpenAI-o1 across math, code, and reasoning tasks. Supports Chain of Thought reasoning with up to 64K output tokens.`,
	},
} as const satisfies Record<string, ModelInfo>

export const DEEP_SEEK_DEFAULT_TEMPERATURE = 0.6
