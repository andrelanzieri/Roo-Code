import type { MockedClass, MockedFunction } from "vitest"
import { OpenAI } from "openai"
import { OpenAICompatibleEmbedder } from "../openai-compatible"

// Mock the OpenAI SDK
vitest.mock("openai")

// Mock global fetch
global.fetch = vitest.fn()

// Mock TelemetryService
vitest.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vitest.fn(),
		},
	},
}))

// Mock i18n
vitest.mock("../../../../i18n", () => ({
	t: (key: string, params?: Record<string, any>) => {
		const translations: Record<string, string> = {
			"embeddings:validation.baseUrlRequired": "Base URL is required",
			"embeddings:validation.apiKeyRequired": "API key is required",
		}
		return translations[key] || key
	},
}))

const MockedOpenAI = OpenAI as MockedClass<typeof OpenAI>

describe("OpenAICompatibleEmbedder - Encoding Format", () => {
	let mockOpenAIInstance: any
	let mockEmbeddingsCreate: MockedFunction<any>

	const testBaseUrl = "https://api.example.com/v1"
	const testApiKey = "test-api-key"
	const testModelId = "text-embedding-3-small"

	beforeEach(() => {
		vitest.clearAllMocks()
		vitest.spyOn(console, "warn").mockImplementation(() => {})
		vitest.spyOn(console, "error").mockImplementation(() => {})

		// Setup mock OpenAI instance
		mockEmbeddingsCreate = vitest.fn()
		mockOpenAIInstance = {
			embeddings: {
				create: mockEmbeddingsCreate,
			},
		}

		MockedOpenAI.mockImplementation(() => mockOpenAIInstance)
	})

	afterEach(() => {
		vitest.restoreAllMocks()
	})

	describe("constructor with encoding format", () => {
		it("should create embedder with default base64 encoding format", () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId)

			expect(MockedOpenAI).toHaveBeenCalledWith({
				baseURL: testBaseUrl,
				apiKey: testApiKey,
			})
			expect(embedder).toBeDefined()
			// Default should be base64
			expect((embedder as any).encodingFormat).toBe("base64")
		})

		it("should create embedder with explicit base64 encoding format", () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "base64")

			expect(embedder).toBeDefined()
			expect((embedder as any).encodingFormat).toBe("base64")
		})

		it("should create embedder with float encoding format", () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "float")

			expect(embedder).toBeDefined()
			expect((embedder as any).encodingFormat).toBe("float")
		})
	})

	describe("createEmbeddings with float format", () => {
		it("should not set encoding_format parameter when using float format", async () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "float")

			const testTexts = ["Hello world"]
			const mockResponse = {
				data: [{ embedding: [0.1, 0.2, 0.3] }],
				usage: { prompt_tokens: 10, total_tokens: 15 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			await embedder.createEmbeddings(testTexts)

			// Should NOT include encoding_format when using float
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				input: testTexts,
				model: testModelId,
				// No encoding_format property
			})
		})

		it("should handle float array responses correctly", async () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "float")

			const testTexts = ["Hello world", "Test text"]
			const mockResponse = {
				data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
				usage: { prompt_tokens: 20, total_tokens: 30 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			const result = await embedder.createEmbeddings(testTexts)

			expect(result).toEqual({
				embeddings: [
					[0.1, 0.2, 0.3],
					[0.4, 0.5, 0.6],
				],
				usage: { promptTokens: 20, totalTokens: 30 },
			})
		})
	})

	describe("createEmbeddings with base64 format", () => {
		it("should set encoding_format to base64 when using base64 format", async () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "base64")

			const testTexts = ["Hello world"]
			// Create a Float32Array with test values
			const testEmbedding = new Float32Array([0.25, 0.5, 0.75])
			const buffer = Buffer.from(testEmbedding.buffer)
			const base64String = buffer.toString("base64")

			const mockResponse = {
				data: [{ embedding: base64String }],
				usage: { prompt_tokens: 10, total_tokens: 15 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			const result = await embedder.createEmbeddings(testTexts)

			// Should include encoding_format: "base64"
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				input: testTexts,
				model: testModelId,
				encoding_format: "base64",
			})

			// Should correctly decode base64 to float array
			expect(result.embeddings[0]).toEqual([0.25, 0.5, 0.75])
		})
	})

	describe("direct HTTP requests with encoding formats", () => {
		it("should use float format in direct HTTP requests", async () => {
			const fullUrl = "https://api.example.com/v1/embeddings"
			const embedder = new OpenAICompatibleEmbedder(fullUrl, testApiKey, testModelId, undefined, "float")

			const mockFetch = global.fetch as MockedFunction<typeof fetch>
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					data: [{ embedding: [0.1, 0.2, 0.3] }],
					usage: { prompt_tokens: 10, total_tokens: 15 },
				}),
				text: async () => "",
			} as any)

			const testTexts = ["Hello world"]
			await embedder.createEmbeddings(testTexts)

			// Check that the request body contains float encoding format
			expect(mockFetch).toHaveBeenCalledWith(
				fullUrl,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						input: testTexts,
						model: testModelId,
						encoding_format: "float",
					}),
				}),
			)
		})

		it("should use base64 format in direct HTTP requests", async () => {
			const fullUrl = "https://api.example.com/v1/embeddings"
			const embedder = new OpenAICompatibleEmbedder(fullUrl, testApiKey, testModelId, undefined, "base64")

			const testEmbedding = new Float32Array([0.25, 0.5, 0.75])
			const buffer = Buffer.from(testEmbedding.buffer)
			const base64String = buffer.toString("base64")

			const mockFetch = global.fetch as MockedFunction<typeof fetch>
			mockFetch.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: async () => ({
					data: [{ embedding: base64String }],
					usage: { prompt_tokens: 10, total_tokens: 15 },
				}),
				text: async () => "",
			} as any)

			const testTexts = ["Hello world"]
			const result = await embedder.createEmbeddings(testTexts)

			// Check that the request body contains base64 encoding format
			expect(mockFetch).toHaveBeenCalledWith(
				fullUrl,
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({
						input: testTexts,
						model: testModelId,
						encoding_format: "base64",
					}),
				}),
			)

			// Should correctly decode base64
			expect(result.embeddings[0]).toEqual([0.25, 0.5, 0.75])
		})
	})

	describe("validateConfiguration with encoding formats", () => {
		it("should validate successfully with float format", async () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "float")

			const mockResponse = {
				data: [{ embedding: [0.1, 0.2, 0.3] }],
				usage: { prompt_tokens: 2, total_tokens: 2 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			const result = await embedder.validateConfiguration()

			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
			// Should not include encoding_format for float
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				input: ["test"],
				model: testModelId,
			})
		})

		it("should validate successfully with base64 format", async () => {
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId, undefined, "base64")

			const testEmbedding = new Float32Array([0.1, 0.2, 0.3])
			const buffer = Buffer.from(testEmbedding.buffer)
			const base64String = buffer.toString("base64")

			const mockResponse = {
				data: [{ embedding: base64String }],
				usage: { prompt_tokens: 2, total_tokens: 2 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			const result = await embedder.validateConfiguration()

			expect(result.valid).toBe(true)
			expect(result.error).toBeUndefined()
			// Should include encoding_format: "base64"
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				input: ["test"],
				model: testModelId,
				encoding_format: "base64",
			})
		})
	})

	describe("backward compatibility", () => {
		it("should maintain backward compatibility when encoding format is not specified", async () => {
			// When no encoding format is specified, it should default to base64
			const embedder = new OpenAICompatibleEmbedder(testBaseUrl, testApiKey, testModelId)

			const testTexts = ["Hello world"]
			const testEmbedding = new Float32Array([0.25, 0.5, 0.75])
			const buffer = Buffer.from(testEmbedding.buffer)
			const base64String = buffer.toString("base64")

			const mockResponse = {
				data: [{ embedding: base64String }],
				usage: { prompt_tokens: 10, total_tokens: 15 },
			}
			mockEmbeddingsCreate.mockResolvedValue(mockResponse)

			await embedder.createEmbeddings(testTexts)

			// Should default to base64 encoding
			expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
				input: testTexts,
				model: testModelId,
				encoding_format: "base64",
			})
		})
	})
})
