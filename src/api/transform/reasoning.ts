import { BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta"
import OpenAI from "openai"
import type { GenerateContentConfig } from "@google/genai"

import type { ModelInfo, ProviderSettings, ReasoningEffortWithMinimal } from "@roo-code/types"

import { shouldUseReasoningBudget, shouldUseReasoningEffort } from "../../shared/api"

export type OpenRouterReasoningParams = {
	effort?: ReasoningEffortWithMinimal
	max_tokens?: number
	exclude?: boolean
}

export type AnthropicReasoningParams = BetaThinkingConfigParam

export type OpenAiReasoningParams = { reasoning_effort: OpenAI.Chat.ChatCompletionCreateParams["reasoning_effort"] }

export type GeminiReasoningParams = GenerateContentConfig["thinkingConfig"]

export type GetModelReasoningOptions = {
	model: ModelInfo
	reasoningBudget: number | undefined
	reasoningEffort: ReasoningEffortWithMinimal | undefined
	settings: ProviderSettings
}

export const getOpenRouterReasoning = ({
	model,
	reasoningBudget,
	reasoningEffort,
	settings,
}: GetModelReasoningOptions): OpenRouterReasoningParams | undefined => {
	// If the model uses a budget-style reasoning config on OpenRouter, pass it through.
	if (shouldUseReasoningBudget({ model, settings })) {
		return { max_tokens: reasoningBudget! }
	}

	// Otherwise, if we support traditional reasoning effort, pass through the effort.
	// Note: Some models (e.g., GPT‑5 via OpenRouter) may support "minimal".
	if (shouldUseReasoningEffort({ model, settings })) {
		if (!reasoningEffort) return undefined
		return { effort: reasoningEffort }
	}

	return undefined
}

export const getAnthropicReasoning = ({
	model,
	reasoningBudget,
	settings,
}: GetModelReasoningOptions): AnthropicReasoningParams | undefined =>
	shouldUseReasoningBudget({ model, settings }) ? { type: "enabled", budget_tokens: reasoningBudget! } : undefined

export const getOpenAiReasoning = ({
	model,
	reasoningEffort,
	settings,
}: GetModelReasoningOptions): OpenAiReasoningParams | undefined => {
	if (!shouldUseReasoningEffort({ model, settings })) {
		return undefined
	}

	// Note: The OpenAI SDK doesn't include "minimal" in its type definitions,
	// but GPT-5 via OpenRouter does support it. Since this function is for
	// direct OpenAI API usage (not OpenRouter), we filter out "minimal" here.
	// OpenRouter handles "minimal" correctly in getOpenRouterReasoning.
	if (reasoningEffort === "minimal") {
		return undefined
	}

	return { reasoning_effort: reasoningEffort }
}

export const getGeminiReasoning = ({
	model,
	reasoningBudget,
	settings,
}: GetModelReasoningOptions): GeminiReasoningParams | undefined =>
	shouldUseReasoningBudget({ model, settings })
		? { thinkingBudget: reasoningBudget!, includeThoughts: true }
		: undefined
