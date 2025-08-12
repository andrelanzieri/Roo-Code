import {
	type ModelInfo,
	type ProviderSettings,
	ANTHROPIC_DEFAULT_MAX_TOKENS,
	CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS,
} from "@roo-code/types"

// ApiHandlerOptions
// Extend ProviderSettings (minus apiProvider) with handler-specific toggles.
export type ApiHandlerOptions = Omit<ProviderSettings, "apiProvider"> & {
	/**
	 * When true and using GPT‑5 Responses API, include reasoning.summary: "auto"
	 * so the API returns reasoning summaries (we already parse and surface them).
	 * Defaults to true; set to false to disable summaries.
	 */
	enableGpt5ReasoningSummary?: boolean
}

// RouterName

const routerNames = [
	"openrouter",
	"requesty",
	"glama",
	"unbound",
	"litellm",
	"ollama",
	"lmstudio",
	"io-intelligence",
] as const

export type RouterName = (typeof routerNames)[number]

export const isRouterName = (value: string): value is RouterName => routerNames.includes(value as RouterName)

export function toRouterName(value?: string): RouterName {
	if (value && isRouterName(value)) {
		return value
	}

	throw new Error(`Invalid router name: ${value}`)
}

// RouterModels

export type ModelRecord = Record<string, ModelInfo>

export type RouterModels = Record<RouterName, ModelRecord>

// Reasoning

export const shouldUseReasoningBudget = ({
	model,
	settings,
}: {
	model: ModelInfo
	settings?: ProviderSettings
}): boolean => !!model.requiredReasoningBudget || (!!model.supportsReasoningBudget && !!settings?.enableReasoningEffort)

export const shouldUseReasoningEffort = ({
	model,
	settings,
}: {
	model: ModelInfo
	settings?: ProviderSettings
}): boolean => (!!model.supportsReasoningEffort && !!settings?.reasoningEffort) || !!model.reasoningEffort

export const DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS = 16_384
export const DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS = 8_192
export const GEMINI_25_PRO_MIN_THINKING_TOKENS = 128

// GPT-5 specific constants
/**
 * Maximum output tokens for GPT-5 models to prevent context window overflow.
 * When input approaches the 272k limit, the model's 128k max output can exceed
 * the total 400k context window, causing API errors.
 * @see https://github.com/cline/cline/issues/5474#issuecomment-3172109387
 */
export const GPT5_MAX_OUTPUT_TOKENS = 10_000

// Max Tokens

export const getModelMaxOutputTokens = ({
	modelId,
	model,
	settings,
	format,
}: {
	modelId: string
	model: ModelInfo
	settings?: ProviderSettings
	format?: "anthropic" | "openai" | "gemini" | "openrouter"
}): number | undefined => {
	// Check for Claude Code specific max output tokens setting
	if (settings?.apiProvider === "claude-code") {
		return settings.claudeCodeMaxOutputTokens || CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS
	}

	// Special handling for GPT-5 models to prevent context window overflow
	// GPT-5 models include: gpt-5, gpt-5-mini, gpt-5-nano, and dated variants
	const isGpt5Model = /^gpt-5(-mini|-nano)?(-\d{4}-\d{2}-\d{2})?$/i.test(modelId)
	if (isGpt5Model) {
		// Allow user override via settings, but cap at GPT5_MAX_OUTPUT_TOKENS
		const userMaxTokens = settings?.modelMaxTokens
		if (userMaxTokens) {
			return Math.min(userMaxTokens, GPT5_MAX_OUTPUT_TOKENS)
		}
		return GPT5_MAX_OUTPUT_TOKENS
	}

	if (shouldUseReasoningBudget({ model, settings })) {
		return settings?.modelMaxTokens || DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS
	}

	const isAnthropicContext =
		modelId.includes("claude") ||
		format === "anthropic" ||
		(format === "openrouter" && modelId.startsWith("anthropic/"))

	// For "Hybrid" reasoning models, discard the model's actual maxTokens for Anthropic contexts
	if (model.supportsReasoningBudget && isAnthropicContext) {
		return ANTHROPIC_DEFAULT_MAX_TOKENS
	}

	// For Anthropic contexts, always ensure a maxTokens value is set
	if (isAnthropicContext && (!model.maxTokens || model.maxTokens === 0)) {
		return ANTHROPIC_DEFAULT_MAX_TOKENS
	}

	// If model has explicit maxTokens, clamp it to 20% of the context window
	if (model.maxTokens) {
		return Math.min(model.maxTokens, Math.ceil(model.contextWindow * 0.2))
	}

	// For non-Anthropic formats without explicit maxTokens, return undefined
	if (format) {
		return undefined
	}

	// Default fallback
	return ANTHROPIC_DEFAULT_MAX_TOKENS
}

// GetModelsOptions

export type GetModelsOptions =
	| { provider: "openrouter" }
	| { provider: "glama" }
	| { provider: "requesty"; apiKey?: string }
	| { provider: "unbound"; apiKey?: string }
	| { provider: "litellm"; apiKey: string; baseUrl: string }
	| { provider: "ollama"; baseUrl?: string }
	| { provider: "lmstudio"; baseUrl?: string }
	| { provider: "io-intelligence"; apiKey: string }
