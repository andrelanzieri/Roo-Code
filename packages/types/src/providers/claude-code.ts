import type { ModelInfo } from "../model.js"

/**
 * Rate limit information from Claude Code API
 */
export interface ClaudeCodeRateLimitInfo {
	// 5-hour limit info
	fiveHour: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// 7-day (weekly) limit info (Sonnet-specific)
	weekly?: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// 7-day unified limit info
	weeklyUnified?: {
		status: string
		utilization: number
		resetTime: number // Unix timestamp
	}
	// Representative claim type
	representativeClaim?: string
	// Overage status
	overage?: {
		status: string
		disabledReason?: string
	}
	// Fallback percentage
	fallbackPercentage?: number
	// Organization ID
	organizationId?: string
	// Timestamp when this was fetched
	fetchedAt: number
}

// Regex pattern to match 8-digit date at the end of model names
const VERTEX_DATE_PATTERN = /-(\d{8})$/

/**
 * Converts Claude model names from hyphen-date format to Vertex AI's @-date format.
 *
 * @param modelName - The original model name (e.g., "claude-sonnet-4-20250514")
 * @returns The converted model name for Vertex AI (e.g., "claude-sonnet-4@20250514")
 *
 * @example
 * convertModelNameForVertex("claude-sonnet-4-20250514") // returns "claude-sonnet-4@20250514"
 * convertModelNameForVertex("claude-model") // returns "claude-model" (no change)
 */
export function convertModelNameForVertex(modelName: string): string {
	// Convert hyphen-date format to @date format for Vertex AI
	return modelName.replace(VERTEX_DATE_PATTERN, "@$1")
}

// Claude Code - Only models that work with Claude Code OAuth tokens
export type ClaudeCodeModelId = keyof typeof claudeCodeModels
export const claudeCodeDefaultModelId: ClaudeCodeModelId = "claude-sonnet-4-5"
export const CLAUDE_CODE_DEFAULT_MAX_OUTPUT_TOKENS = 16000

/**
 * Reasoning effort configuration for Claude Code thinking mode.
 * Maps reasoning effort level to budget_tokens for the thinking process.
 *
 * Note: With interleaved thinking (enabled via beta header), budget_tokens
 * can exceed max_tokens as the token limit becomes the entire context window.
 * The max_tokens is drawn from the model's maxTokens definition.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking#interleaved-thinking
 */
export const claudeCodeReasoningConfig = {
	low: { budgetTokens: 16_000 },
	medium: { budgetTokens: 32_000 },
	high: { budgetTokens: 64_000 },
} as const

export type ClaudeCodeReasoningLevel = keyof typeof claudeCodeReasoningConfig

/**
 * Gets the appropriate model ID based on whether Vertex AI is being used.
 *
 * @param baseModelId - The base Claude Code model ID
 * @param useVertex - Whether to format the model ID for Vertex AI (default: false)
 * @returns The model ID, potentially formatted for Vertex AI
 *
 * @example
 * getClaudeCodeModelId("claude-sonnet-4-20250514", true) // returns "claude-sonnet-4@20250514"
 * getClaudeCodeModelId("claude-sonnet-4-20250514", false) // returns "claude-sonnet-4-20250514"
 */
export function getClaudeCodeModelId(baseModelId: ClaudeCodeModelId, useVertex = false): string {
	return useVertex ? convertModelNameForVertex(baseModelId) : baseModelId
}

// Models that work with Claude Code OAuth tokens
// See: https://docs.anthropic.com/en/docs/claude-code
// NOTE: Claude Code is subscription-based with no per-token cost - pricing fields are 0
export const claudeCodeModels = {
	"claude-haiku-4-5": {
		maxTokens: 32768,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsNativeTools: true,
		defaultToolProtocol: "native",
		supportsReasoningEffort: ["disable", "low", "medium", "high"],
		reasoningEffort: "medium",
		description: "Claude Haiku 4.5 - Fast and efficient with thinking",
	},
	"claude-sonnet-4-5": {
		maxTokens: 32768,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsNativeTools: true,
		defaultToolProtocol: "native",
		supportsReasoningEffort: ["disable", "low", "medium", "high"],
		reasoningEffort: "medium",
		description: "Claude Sonnet 4.5 - Balanced performance with thinking",
	},
	"claude-opus-4-5": {
		maxTokens: 32768,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsNativeTools: true,
		defaultToolProtocol: "native",
		supportsReasoningEffort: ["disable", "low", "medium", "high"],
		reasoningEffort: "medium",
		description: "Claude Opus 4.5 - Most capable with thinking",
	},
} as const satisfies Record<string, ModelInfo>
