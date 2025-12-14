import { convertModelNameForVertex, getClaudeCodeModelId, normalizeClaudeCodeModelId } from "../claude-code.js"

describe("convertModelNameForVertex", () => {
	test("should convert hyphen-date format to @date format", () => {
		expect(convertModelNameForVertex("claude-sonnet-4-20250514")).toBe("claude-sonnet-4@20250514")
		expect(convertModelNameForVertex("claude-opus-4-20250514")).toBe("claude-opus-4@20250514")
		expect(convertModelNameForVertex("claude-3-7-sonnet-20250219")).toBe("claude-3-7-sonnet@20250219")
		expect(convertModelNameForVertex("claude-3-5-sonnet-20241022")).toBe("claude-3-5-sonnet@20241022")
		expect(convertModelNameForVertex("claude-3-5-haiku-20241022")).toBe("claude-3-5-haiku@20241022")
	})

	test("should not modify models without date pattern", () => {
		expect(convertModelNameForVertex("some-other-model")).toBe("some-other-model")
		expect(convertModelNameForVertex("claude-model")).toBe("claude-model")
		expect(convertModelNameForVertex("model-with-short-date-123")).toBe("model-with-short-date-123")
	})

	test("should only convert 8-digit date patterns at the end", () => {
		expect(convertModelNameForVertex("claude-20250514-sonnet")).toBe("claude-20250514-sonnet")
		expect(convertModelNameForVertex("model-20250514-with-more")).toBe("model-20250514-with-more")
	})
})

describe("getClaudeCodeModelId", () => {
	test("should return original model when useVertex is false", () => {
		// Use valid ClaudeCodeModelId values - they don't have date suffixes
		expect(getClaudeCodeModelId("claude-sonnet-4-5", false)).toBe("claude-sonnet-4-5")
		expect(getClaudeCodeModelId("claude-opus-4-5", false)).toBe("claude-opus-4-5")
		expect(getClaudeCodeModelId("claude-haiku-4-5", false)).toBe("claude-haiku-4-5")
	})

	test("should return same model when useVertex is true (no date suffix to convert)", () => {
		// Valid ClaudeCodeModelIds don't have 8-digit date suffixes, so no conversion happens
		expect(getClaudeCodeModelId("claude-sonnet-4-5", true)).toBe("claude-sonnet-4-5")
		expect(getClaudeCodeModelId("claude-opus-4-5", true)).toBe("claude-opus-4-5")
		expect(getClaudeCodeModelId("claude-haiku-4-5", true)).toBe("claude-haiku-4-5")
	})

	test("should default to useVertex false when parameter not provided", () => {
		expect(getClaudeCodeModelId("claude-sonnet-4-5")).toBe("claude-sonnet-4-5")
	})
})

describe("normalizeClaudeCodeModelId", () => {
	test("should return valid model IDs unchanged", () => {
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-5")).toBe("claude-sonnet-4-5")
		expect(normalizeClaudeCodeModelId("claude-opus-4-5")).toBe("claude-opus-4-5")
		expect(normalizeClaudeCodeModelId("claude-haiku-4-5")).toBe("claude-haiku-4-5")
	})

	test("should normalize sonnet models with date suffix to claude-sonnet-4-5", () => {
		// Sonnet 4.5 with date
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5")
		// Sonnet 4 (legacy)
		expect(normalizeClaudeCodeModelId("claude-sonnet-4-20250514")).toBe("claude-sonnet-4-5")
		// Claude 3.7 Sonnet
		expect(normalizeClaudeCodeModelId("claude-3-7-sonnet-20250219")).toBe("claude-sonnet-4-5")
		// Claude 3.5 Sonnet
		expect(normalizeClaudeCodeModelId("claude-3-5-sonnet-20241022")).toBe("claude-sonnet-4-5")
	})

	test("should normalize opus models with date suffix to claude-opus-4-5", () => {
		// Opus 4.5 with date
		expect(normalizeClaudeCodeModelId("claude-opus-4-5-20251101")).toBe("claude-opus-4-5")
		// Opus 4.1 (legacy)
		expect(normalizeClaudeCodeModelId("claude-opus-4-1-20250805")).toBe("claude-opus-4-5")
		// Opus 4 (legacy)
		expect(normalizeClaudeCodeModelId("claude-opus-4-20250514")).toBe("claude-opus-4-5")
	})

	test("should normalize haiku models with date suffix to claude-haiku-4-5", () => {
		// Haiku 4.5 with date
		expect(normalizeClaudeCodeModelId("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5")
		// Claude 3.5 Haiku
		expect(normalizeClaudeCodeModelId("claude-3-5-haiku-20241022")).toBe("claude-haiku-4-5")
	})

	test("should handle case-insensitive model family matching", () => {
		expect(normalizeClaudeCodeModelId("Claude-Sonnet-4-5-20250929")).toBe("claude-sonnet-4-5")
		expect(normalizeClaudeCodeModelId("CLAUDE-OPUS-4-5-20251101")).toBe("claude-opus-4-5")
	})

	test("should fallback to default for unrecognized models", () => {
		expect(normalizeClaudeCodeModelId("unknown-model")).toBe("claude-sonnet-4-5")
		expect(normalizeClaudeCodeModelId("gpt-4")).toBe("claude-sonnet-4-5")
	})
})
