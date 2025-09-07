import { ProviderSettings } from "@roo-code/types"

/**
 * Configuration for the sub-LLM system
 */
export interface SubLlmConfig {
	/** Whether sub-LLM features are enabled */
	enabled: boolean
	/** Mode for model selection: 'mirror' uses chat model, 'custom' allows override */
	modelMode: SubLlmMode
	/** Provider settings when using custom mode */
	customProvider?: ProviderSettings
	/** Maximum tokens per operation */
	maxTokensPerOp?: number
	/** Daily cost cap in USD */
	dailyCostCapUSD?: number
	/** Timeout for LLM operations in milliseconds */
	timeout?: number
}

export type SubLlmMode = "mirror" | "custom"

/**
 * Query variant for multi-query expansion
 */
export interface QueryVariant {
	/** The rewritten query */
	query: string
	/** Type of variant (e.g., 'synonym', 'symbol', 'natural') */
	type: string
	/** Optional explanation of the rewrite */
	reason?: string
}

/**
 * Result from reranking operation
 */
export interface RerankResult {
	/** Original item ID or index */
	id: string | number
	/** Rerank score between 0 and 1 */
	score: number
	/** Optional reasoning for the score */
	reason?: string
}

/**
 * Result from summarization operation
 */
export interface SummaryResult {
	/** One-line title */
	title?: string
	/** 1-2 sentence summary */
	summary: string
	/** 2-5 relevant tags */
	tags?: string[]
}

/**
 * Options for LLM generation
 */
export interface GenerateOptions {
	/** Maximum tokens for the response */
	maxTokens?: number
	/** Temperature for generation */
	temperature?: number
	/** System prompt override */
	systemPrompt?: string
	/** Timeout in milliseconds */
	timeout?: number
}

/**
 * JSON generation options with schema validation
 */
export interface GenerateJsonOptions<T> extends GenerateOptions {
	/** Zod schema for validation */
	schema?: any
	/** Whether to retry on validation failure */
	retryOnValidationFailure?: boolean
	/** Maximum retry attempts */
	maxRetries?: number
}
