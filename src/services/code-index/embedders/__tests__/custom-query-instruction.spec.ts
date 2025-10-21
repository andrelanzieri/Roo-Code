// Test suite for custom query instruction functionality across all embedders
import { OpenAiEmbedder } from "../openai"
import { CodeIndexOllamaEmbedder } from "../ollama"
import { OpenAICompatibleEmbedder } from "../openai-compatible"
import { GeminiEmbedder } from "../gemini"
import { MistralEmbedder } from "../mistral"
import { VercelAiGatewayEmbedder } from "../vercel-ai-gateway"
import { getModelQueryPrefix } from "../../../../shared/embeddingModels"

// Mock the embeddingModels module
vi.mock("../../../../shared/embeddingModels", () => ({
	getModelQueryPrefix: vi.fn(),
	getModelDimension: vi.fn(),
	getDefaultModelId: vi.fn(),
}))

const mockedGetModelQueryPrefix = vi.mocked(getModelQueryPrefix)

describe("Custom Query Instruction Support", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		// Setup default mock behavior
		mockedGetModelQueryPrefix.mockReturnValue(undefined)
	})

	describe("OpenAI Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "Represent this code for searching:"
			const embedder = new OpenAiEmbedder({
				openAiNativeApiKey: "test-api-key",
				openAiEmbeddingModelId: "text-embedding-3-small",
				customQueryInstruction: customInstruction,
			})

			// Mock the OpenAI API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1536).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "search_query: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new OpenAiEmbedder({
				openAiNativeApiKey: "test-api-key",
				openAiEmbeddingModelId: "text-embedding-3-small",
				// No custom instruction
			})

			// Mock the OpenAI API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1536).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("openai", "text-embedding-3-small")
		})

		it("should use empty string custom instruction when explicitly set", async () => {
			const embedder = new OpenAiEmbedder({
				openAiNativeApiKey: "test-api-key",
				openAiEmbeddingModelId: "text-embedding-3-small",
				customQueryInstruction: "", // Explicitly empty custom instruction
			})

			// Mock the OpenAI API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1536).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that no prefix was added
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe("test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})
	})

	describe("Ollama Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "query: "
			const embedder = new CodeIndexOllamaEmbedder({
				ollamaBaseUrl: "http://localhost:11434",
				ollamaModelId: "nomic-embed-text",
				customQueryInstruction: customInstruction,
			})

			// Mock the Ollama API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embeddings: [new Array(768).fill(0.1)],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "search_query: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new CodeIndexOllamaEmbedder({
				ollamaBaseUrl: "http://localhost:11434",
				ollamaModelId: "nomic-embed-code",
				// No custom instruction
			})

			// Mock the Ollama API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embeddings: [new Array(768).fill(0.1)],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("ollama", "nomic-embed-code")
		})
	})

	describe("OpenAI Compatible Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "Represent for retrieval: "
			const embedder = new OpenAICompatibleEmbedder(
				"https://api.example.com",
				"custom-model",
				"test-api-key",
				1024, // dimension
				customInstruction,
			)

			// Mock the API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1024).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "search_document: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new OpenAICompatibleEmbedder(
				"https://api.example.com",
				"custom-model",
				"test-api-key",
				1024, // dimension
				undefined, // No custom instruction
			)

			// Mock the API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1024).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("openai-compatible", "custom-model")
		})
	})

	describe("Gemini Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "Code search query: "
			const embedder = new GeminiEmbedder("test-api-key", "text-embedding-004", customInstruction)

			// Mock the Gemini API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embedding: {
						values: new Array(768).fill(0.1),
					},
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.content.parts[0].text).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "retrieval: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new GeminiEmbedder(
				"test-api-key",
				"text-embedding-004",
				undefined, // No custom instruction
			)

			// Mock the Gemini API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					embedding: {
						values: new Array(768).fill(0.1),
					},
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.content.parts[0].text).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("gemini", "text-embedding-004")
		})
	})

	describe("Mistral Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "Embedding query: "
			const embedder = new MistralEmbedder("test-api-key", "mistral-embed", customInstruction)

			// Mock the Mistral API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1024).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input[0]).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "search_query: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new MistralEmbedder(
				"test-api-key",
				"mistral-embed",
				undefined, // No custom instruction
			)

			// Mock the Mistral API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1024).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input[0]).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("mistral", "mistral-embed")
		})
	})

	describe("Vercel AI Gateway Embedder", () => {
		it("should use custom query instruction when provided", async () => {
			const customInstruction = "Search: "
			const embedder = new VercelAiGatewayEmbedder(
				"test-api-key",
				"openai:text-embedding-3-small",
				customInstruction,
			)

			// Mock the Vercel AI Gateway API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1536).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the custom instruction was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(customInstruction + "test query")
			expect(mockedGetModelQueryPrefix).not.toHaveBeenCalled()
		})

		it("should fall back to model-specific prefix when no custom instruction", async () => {
			const modelPrefix = "query: "
			mockedGetModelQueryPrefix.mockReturnValue(modelPrefix)

			const embedder = new VercelAiGatewayEmbedder(
				"test-api-key",
				"openai:text-embedding-3-small",
				undefined, // No custom instruction
			)

			// Mock the Vercel AI Gateway API call
			const mockFetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					data: [{ embedding: new Array(1536).fill(0.1) }],
				}),
			})
			global.fetch = mockFetch

			await embedder.createEmbeddings(["test query"])

			// Check that the model prefix was used
			const fetchCall = mockFetch.mock.calls[0]
			const requestBody = JSON.parse(fetchCall[1].body)
			expect(requestBody.input).toBe(modelPrefix + "test query")
			expect(mockedGetModelQueryPrefix).toHaveBeenCalledWith("vercel-ai-gateway", "openai:text-embedding-3-small")
		})
	})
})
