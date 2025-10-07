import type { ModelInfo } from "../model.js"
import type { SiliconCloudApiLine } from "../provider-settings.js"

export const siliconCloudDefaultModelId = "zai-org/GLM-4.6"

export const siliconCloudApiLineConfigs = {
	china: { name: "国内版", baseUrl: "https://api.siliconflow.cn/v1" },
	"china-overseas": { name: "国内版（海外访问）", baseUrl: "https://api-st.siliconflow.cn/v1" },
	international: { name: "国际版", baseUrl: "https://api.siliconflow.com/v1" },
} satisfies Record<SiliconCloudApiLine, { name: string; baseUrl: string }>

const siliconCloudChinaModels: Record<string, ModelInfo> = {
	"Pro/deepseek-ai/DeepSeek-V3.1-Terminus": {
		contextWindow: 163840,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.28,
		supportsReasoningBudget: true,
	},
	"zai-org/GLM-4.6": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		supportsReasoningBudget: true,
	},
	"Qwen/QwQ-32B-Preview": {
		contextWindow: 32768,
		maxTokens: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		supportsReasoningBudget: true,
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"deepseek-ai/DeepSeek-V2.5": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.28,
	},
	"deepseek-ai/DeepSeek-Coder-V2-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.28,
	},
	"Qwen/Qwen2.5-72B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.35,
		outputPrice: 1.4,
	},
	"meta-llama/Meta-Llama-3.1-70B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.35,
		outputPrice: 0.42,
	},
	"meta-llama/Meta-Llama-3.1-405B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.1,
		outputPrice: 2.1,
	},
	"google/gemma-2-27b-it": {
		contextWindow: 8192,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.28,
	},
	"01-ai/Yi-1.5-34B-Chat-16K": {
		contextWindow: 16384,
		maxTokens: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.84,
	},
	"internlm/internlm2_5-20b-chat": {
		contextWindow: 32768,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.14,
		outputPrice: 0.28,
	},
}

const siliconCloudChinaOverseasModels: Record<string, ModelInfo> = {
	...siliconCloudChinaModels,
}

const siliconCloudInternationalModels: Record<string, ModelInfo> = {
	"Pro/deepseek-ai/DeepSeek-V3.1-Terminus": {
		contextWindow: 163840,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.04,
		supportsReasoningBudget: true,
	},
	"zai-org/GLM-4.6": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		supportsReasoningBudget: true,
	},
	"Qwen/QwQ-32B-Preview": {
		contextWindow: 32768,
		maxTokens: 32768,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		supportsReasoningBudget: true,
	},
	"Qwen/Qwen2.5-Coder-32B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
	},
	"deepseek-ai/DeepSeek-V2.5": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.04,
	},
	"deepseek-ai/DeepSeek-Coder-V2-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.04,
	},
	"Qwen/Qwen2.5-72B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.05,
		outputPrice: 0.2,
	},
	"meta-llama/Meta-Llama-3.1-70B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.05,
		outputPrice: 0.06,
	},
	"meta-llama/Meta-Llama-3.1-405B-Instruct": {
		contextWindow: 131072,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.3,
	},
	"google/gemma-2-27b-it": {
		contextWindow: 8192,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.04,
	},
	"01-ai/Yi-1.5-34B-Chat-16K": {
		contextWindow: 16384,
		maxTokens: 4096,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.12,
	},
	"internlm/internlm2_5-20b-chat": {
		contextWindow: 32768,
		maxTokens: 8192,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.02,
		outputPrice: 0.04,
	},
}

export const siliconCloudModelsByApiLine = {
	china: siliconCloudChinaModels,
	"china-overseas": siliconCloudChinaOverseasModels,
	international: siliconCloudInternationalModels,
} satisfies Record<SiliconCloudApiLine, Record<string, ModelInfo>>

// Export all models for the default list
export const siliconCloudModels = siliconCloudChinaModels

export type SiliconCloudModelId = keyof typeof siliconCloudModels
