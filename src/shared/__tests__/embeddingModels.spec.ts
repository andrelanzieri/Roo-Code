import { describe, it, expect } from "vitest"
import {
	getModelDimension,
	getModelScoreThreshold,
	getModelQueryPrefix,
	getDefaultModelId,
	EMBEDDING_MODEL_PROFILES,
} from "../embeddingModels"

describe("embeddingModels", () => {
	describe("getModelDimension", () => {
		it("should return the correct dimension for a valid model", () => {
			expect(getModelDimension("openai", "text-embedding-3-small")).toBe(1536)
			expect(getModelDimension("openai", "text-embedding-3-large")).toBe(3072)
			expect(getModelDimension("openrouter", "qwen/qwen3-embedding-8b")).toBe(4096)
		})

		it("should be case-insensitive for model IDs", () => {
			// Test with different case variations
			expect(getModelDimension("openai", "TEXT-EMBEDDING-3-SMALL")).toBe(1536)
			expect(getModelDimension("openai", "Text-Embedding-3-Large")).toBe(3072)
			expect(getModelDimension("openrouter", "Qwen/Qwen3-Embedding-8B")).toBe(4096)
			expect(getModelDimension("openrouter", "QWEN/QWEN3-EMBEDDING-8B")).toBe(4096)

			// Test with mixed case for other providers
			expect(getModelDimension("gemini", "TEXT-EMBEDDING-004")).toBe(768)
			expect(getModelDimension("mistral", "CODESTRAL-EMBED-2505")).toBe(1536)
		})

		it("should return undefined for non-existent model", () => {
			expect(getModelDimension("openai", "non-existent-model")).toBeUndefined()
		})

		it("should return undefined for non-existent provider", () => {
			// @ts-expect-error Testing with invalid provider
			expect(getModelDimension("non-existent-provider", "text-embedding-3-small")).toBeUndefined()
		})

		it("should handle lowercase model IDs that exist in profiles", () => {
			expect(getModelDimension("openai", "text-embedding-ada-002")).toBe(1536)
			expect(getModelDimension("ollama", "nomic-embed-text")).toBe(768)
		})
	})

	describe("getModelScoreThreshold", () => {
		it("should return the correct score threshold for a valid model", () => {
			expect(getModelScoreThreshold("openai", "text-embedding-3-small")).toBe(0.4)
			expect(getModelScoreThreshold("ollama", "nomic-embed-code")).toBe(0.15)
			expect(getModelScoreThreshold("openrouter", "qwen/qwen3-embedding-8b")).toBe(0.4)
		})

		it("should be case-insensitive for model IDs", () => {
			// Test with different case variations
			expect(getModelScoreThreshold("openai", "TEXT-EMBEDDING-3-SMALL")).toBe(0.4)
			expect(getModelScoreThreshold("ollama", "NOMIC-EMBED-CODE")).toBe(0.15)
			expect(getModelScoreThreshold("openrouter", "Qwen/Qwen3-Embedding-8B")).toBe(0.4)

			// Test models without score thresholds
			expect(getModelScoreThreshold("gemini", "TEXT-EMBEDDING-004")).toBeUndefined()
		})

		it("should return undefined for model without score threshold", () => {
			expect(getModelScoreThreshold("gemini", "text-embedding-004")).toBeUndefined()
		})

		it("should return undefined for non-existent model", () => {
			expect(getModelScoreThreshold("openai", "non-existent-model")).toBeUndefined()
		})

		it("should return undefined for non-existent provider", () => {
			// @ts-expect-error Testing with invalid provider
			expect(getModelScoreThreshold("non-existent-provider", "text-embedding-3-small")).toBeUndefined()
		})
	})

	describe("getModelQueryPrefix", () => {
		it("should return the correct query prefix for a model that has one", () => {
			expect(getModelQueryPrefix("ollama", "nomic-embed-code")).toBe(
				"Represent this query for searching relevant code: ",
			)
		})

		it("should be case-insensitive for model IDs", () => {
			// Test with different case variations
			expect(getModelQueryPrefix("ollama", "NOMIC-EMBED-CODE")).toBe(
				"Represent this query for searching relevant code: ",
			)
			expect(getModelQueryPrefix("ollama", "Nomic-Embed-Code")).toBe(
				"Represent this query for searching relevant code: ",
			)
			expect(getModelQueryPrefix("openai-compatible", "NOMIC-EMBED-CODE")).toBe(
				"Represent this query for searching relevant code: ",
			)
		})

		it("should return undefined for model without query prefix", () => {
			expect(getModelQueryPrefix("openai", "text-embedding-3-small")).toBeUndefined()
			expect(getModelQueryPrefix("gemini", "text-embedding-004")).toBeUndefined()
		})

		it("should return undefined for non-existent model", () => {
			expect(getModelQueryPrefix("ollama", "non-existent-model")).toBeUndefined()
		})

		it("should return undefined for non-existent provider", () => {
			// @ts-expect-error Testing with invalid provider
			expect(getModelQueryPrefix("non-existent-provider", "nomic-embed-code")).toBeUndefined()
		})
	})

	describe("getDefaultModelId", () => {
		it("should return the correct default model for each provider", () => {
			expect(getDefaultModelId("openai")).toBe("text-embedding-3-small")
			expect(getDefaultModelId("openai-compatible")).toBe("text-embedding-3-small")
			expect(getDefaultModelId("gemini")).toBe("gemini-embedding-001")
			expect(getDefaultModelId("mistral")).toBe("codestral-embed-2505")
			expect(getDefaultModelId("vercel-ai-gateway")).toBe("openai/text-embedding-3-large")
			expect(getDefaultModelId("openrouter")).toBe("openai/text-embedding-3-large")
		})

		it("should return a default for Ollama", () => {
			const defaultModel = getDefaultModelId("ollama")
			expect(defaultModel).toBeDefined()
			expect(EMBEDDING_MODEL_PROFILES.ollama?.[defaultModel]).toBeDefined()
		})

		it("should return fallback for unknown provider", () => {
			// @ts-expect-error Testing with invalid provider
			expect(getDefaultModelId("unknown-provider")).toBe("text-embedding-3-small")
		})
	})

	describe("Qwen model specific tests", () => {
		it("should handle Qwen model with original casing", () => {
			expect(getModelDimension("openrouter", "qwen/qwen3-embedding-8b")).toBe(4096)
			expect(getModelScoreThreshold("openrouter", "qwen/qwen3-embedding-8b")).toBe(0.4)
		})

		it("should handle Qwen model with user's casing from issue", () => {
			// This is the exact casing from the user's issue
			expect(getModelDimension("openrouter", "Qwen/Qwen3-Embedding-8B")).toBe(4096)
			expect(getModelScoreThreshold("openrouter", "Qwen/Qwen3-Embedding-8B")).toBe(0.4)
		})

		it("should handle Qwen model with all uppercase", () => {
			expect(getModelDimension("openrouter", "QWEN/QWEN3-EMBEDDING-8B")).toBe(4096)
			expect(getModelScoreThreshold("openrouter", "QWEN/QWEN3-EMBEDDING-8B")).toBe(0.4)
		})

		it("should handle Qwen model with random casing", () => {
			expect(getModelDimension("openrouter", "qWeN/QwEn3-EmBeDdInG-8b")).toBe(4096)
			expect(getModelScoreThreshold("openrouter", "qWeN/QwEn3-EmBeDdInG-8b")).toBe(0.4)
		})
	})
})
