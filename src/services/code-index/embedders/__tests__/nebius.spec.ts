import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NebiusEmbedder } from "../nebius"
import { OpenAI } from "openai"
import { t } from "../../../../i18n"

// Mock dependencies
vi.mock("openai")
vi.mock("../../../../i18n", () => ({
	t: vi.fn((key: string, params?: any) => {
		if (params) {
			return `${key} ${JSON.stringify(params)}`
		}
		return key
	}),
}))

// Mock the validation helpers
vi.mock("../../shared/validation-helpers", () => ({
	withValidationErrorHandling: vi.fn(async (fn, provider) => {
		try {
			return await fn()
		} catch (error) {
			return {
				valid: false,
				error: error instanceof Error ? error.message : String(error),
			}
		}
	}),
	formatEmbeddingError: vi.fn((error, maxRetries) => {
		if (error instanceof Error) {
			return error
		}
		return new Error(`Failed after ${maxRetries} attempts`)
	}),
	HttpError: class HttpError extends Error {
		status?: number
		constructor(message: string, status?: number) {
			super(message)
			this.status = status
		}
	},
}))

describe("NebiusEmbedder", () => {
	let embedder: NebiusEmbedder
	let mockCreate: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockCreate = vi.fn()
		;(OpenAI as any).mockImplementation(() => ({
			embeddings: {
				create: mockCreate,
			},
		}))
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should create embedder with API key", () => {
			const apiKey = "test-api-key"

			// Act
			embedder = new NebiusEmbedder(apiKey)

			// Assert
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: "https://api.studio.nebius.com/v1/",
				apiKey: apiKey,
			})
		})

		it("should create embedder with custom model ID", () => {
			const apiKey = "test-api-key"
			const modelId = "custom-model"

			// Act
			embedder = new NebiusEmbedder(apiKey, modelId)

			// Assert
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: "https://api.studio.nebius.com/v1/",
				apiKey: apiKey,
			})
		})

		it("should throw error if API key is not provided", () => {
			// Act & Assert
			expect(() => new NebiusEmbedder("")).toThrow("validation.apiKeyRequired")
			expect(() => new NebiusEmbedder(null as any)).toThrow("validation.apiKeyRequired")
			expect(() => new NebiusEmbedder(undefined as any)).toThrow("validation.apiKeyRequired")
		})
	})

	describe("createEmbeddings", () => {
		beforeEach(() => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")
		})

		it("should create embeddings successfully", async () => {
			// Arrange
			const texts = ["test text 1", "test text 2"]
			const mockResponse = {
				data: [
					{ embedding: btoa(new Float32Array(4096).buffer as any) },
					{ embedding: btoa(new Float32Array(4096).buffer as any) },
				],
				usage: {
					prompt_tokens: 10,
					total_tokens: 20,
				},
			}
			mockCreate.mockResolvedValue(mockResponse)

			// Act
			const result = await embedder.createEmbeddings(texts)

			// Assert
			expect(mockCreate).toHaveBeenCalledWith({
				input: texts,
				model: "Qwen/Qwen3-Embedding-8B",
				encoding_format: "base64",
			})
			expect(result.embeddings).toHaveLength(2)
			expect(result.usage).toEqual({
				promptTokens: 10,
				totalTokens: 20,
			})
		})

		it("should use custom model if provided", async () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key", "custom-embed-model")
			const texts = ["test text 1", "test text 2"]
			const mockResponse = {
				data: [
					{ embedding: btoa(new Float32Array(4096).buffer as any) },
					{ embedding: btoa(new Float32Array(4096).buffer as any) },
				],
				usage: {
					prompt_tokens: 10,
					total_tokens: 20,
				},
			}
			mockCreate.mockResolvedValue(mockResponse)

			// Act
			const result = await embedder.createEmbeddings(texts, "override-model")

			// Assert
			expect(mockCreate).toHaveBeenCalledWith({
				input: texts,
				model: "override-model",
				encoding_format: "base64",
			})
			expect(result.embeddings).toHaveLength(2)
		})

		it("should handle rate limit errors with retry", async () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")
			const texts = ["test text"]
			const rateLimitError = new Error("Rate limit exceeded") as any
			rateLimitError.status = 429

			const mockResponse = {
				data: [{ embedding: btoa(new Float32Array(4096).buffer as any) }],
				usage: {
					prompt_tokens: 5,
					total_tokens: 10,
				},
			}

			mockCreate.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(mockResponse)

			// Act
			const result = await embedder.createEmbeddings(texts)

			// Assert
			expect(mockCreate).toHaveBeenCalledTimes(2)
			expect(result.embeddings).toHaveLength(1)
		})
	})

	describe("validateConfiguration", () => {
		it("should validate configuration successfully", async () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")
			mockCreate.mockResolvedValue({
				data: [{ embedding: btoa(new Float32Array(4096).buffer as any) }],
			})

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(result).toEqual({ valid: true })
			expect(mockCreate).toHaveBeenCalledWith({
				input: ["test"],
				model: "Qwen/Qwen3-Embedding-8B",
				encoding_format: "base64",
			})
		})

		it("should return invalid if response has no data", async () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")
			mockCreate.mockResolvedValue({
				data: [],
			})

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(result).toEqual({
				valid: false,
				error: "embeddings:nebius.invalidResponseFormat",
			})
		})

		it("should handle validation errors", async () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")
			mockCreate.mockRejectedValue(new Error("Validation failed"))

			// Act
			const result = await embedder.validateConfiguration()

			// Assert
			expect(result).toEqual({
				valid: false,
				error: "Validation failed",
			})
		})
	})

	describe("embedderInfo", () => {
		it("should return correct embedder info", () => {
			// Arrange
			embedder = new NebiusEmbedder("test-api-key")

			// Act
			const info = embedder.embedderInfo

			// Assert
			expect(info).toEqual({
				name: "nebius",
			})
		})
	})
})
