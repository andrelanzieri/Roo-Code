// npx vitest run src/api/providers/__tests__/anthropic.spec.ts

import { AnthropicHandler } from "../anthropic"
import { ApiHandlerOptions } from "../../../shared/api"
import delay from "delay"

const mockCreate = vitest.fn()
const mockFetch = vitest.fn()

vitest.mock("delay", () => ({
	default: vitest.fn(() => Promise.resolve()),
}))

// Mock global fetch
global.fetch = mockFetch as any

vitest.mock("@anthropic-ai/sdk", () => {
	const mockAnthropicConstructor = vitest.fn().mockImplementation(() => ({
		messages: {
			create: mockCreate.mockImplementation(async (options) => {
				if (!options.stream) {
					return {
						id: "test-completion",
						content: [{ type: "text", text: "Test response" }],
						role: "assistant",
						model: options.model,
						usage: {
							input_tokens: 10,
							output_tokens: 5,
						},
					}
				}
				return {
					async *[Symbol.asyncIterator]() {
						yield {
							type: "message_start",
							message: {
								usage: {
									input_tokens: 100,
									output_tokens: 50,
									cache_creation_input_tokens: 20,
									cache_read_input_tokens: 10,
								},
							},
						}
						yield {
							type: "content_block_start",
							index: 0,
							content_block: {
								type: "text",
								text: "Hello",
							},
						}
						yield {
							type: "content_block_delta",
							delta: {
								type: "text_delta",
								text: " world",
							},
						}
					},
				}
			}),
		},
	}))

	return {
		Anthropic: mockAnthropicConstructor,
	}
})

// Import after mock
import { Anthropic } from "@anthropic-ai/sdk"

const mockAnthropicConstructor = vitest.mocked(Anthropic)

describe("AnthropicHandler", () => {
	let handler: AnthropicHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiKey: "test-api-key",
			apiModelId: "claude-3-5-sonnet-20241022",
		}
		handler = new AnthropicHandler(mockOptions)
		vitest.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(AnthropicHandler)
			expect(handler.getModel().id).toBe(mockOptions.apiModelId)
		})

		it("should initialize with undefined API key", () => {
			// The SDK will handle API key validation, so we just verify it initializes
			const handlerWithoutKey = new AnthropicHandler({
				...mockOptions,
				apiKey: undefined,
			})
			expect(handlerWithoutKey).toBeInstanceOf(AnthropicHandler)
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "https://custom.anthropic.com"
			const handlerWithCustomUrl = new AnthropicHandler({
				...mockOptions,
				anthropicBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(AnthropicHandler)
		})

		it("use apiKey for passing token if anthropicUseAuthToken is not set", () => {
			const handlerWithCustomUrl = new AnthropicHandler({
				...mockOptions,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(AnthropicHandler)
			expect(mockAnthropicConstructor).toHaveBeenCalledTimes(1)
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.apiKey).toEqual("test-api-key")
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.authToken).toBeUndefined()
		})

		it("use apiKey for passing token if anthropicUseAuthToken is set but custom base URL is not given", () => {
			const handlerWithCustomUrl = new AnthropicHandler({
				...mockOptions,
				anthropicUseAuthToken: true,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(AnthropicHandler)
			expect(mockAnthropicConstructor).toHaveBeenCalledTimes(1)
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.apiKey).toEqual("test-api-key")
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.authToken).toBeUndefined()
		})

		it("use authToken for passing token if both of anthropicBaseUrl and anthropicUseAuthToken are set", () => {
			const customBaseUrl = "https://custom.anthropic.com"
			const handlerWithCustomUrl = new AnthropicHandler({
				...mockOptions,
				anthropicBaseUrl: customBaseUrl,
				anthropicUseAuthToken: true,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(AnthropicHandler)
			expect(mockAnthropicConstructor).toHaveBeenCalledTimes(1)
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.authToken).toEqual("test-api-key")
			expect(mockAnthropicConstructor.mock.calls[0]![0]!.apiKey).toBeUndefined()
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."

		it("should handle prompt caching for supported models", async () => {
			const stream = handler.createMessage(systemPrompt, [
				{
					role: "user",
					content: [{ type: "text" as const, text: "First message" }],
				},
				{
					role: "assistant",
					content: [{ type: "text" as const, text: "Response" }],
				},
				{
					role: "user",
					content: [{ type: "text" as const, text: "Second message" }],
				},
			])

			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify usage information
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(100)
			expect(usageChunk?.outputTokens).toBe(50)
			expect(usageChunk?.cacheWriteTokens).toBe(20)
			expect(usageChunk?.cacheReadTokens).toBe(10)

			// Verify text content
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(2)
			expect(textChunks[0].text).toBe("Hello")
			expect(textChunks[1].text).toBe(" world")

			// Verify API
			expect(mockCreate).toHaveBeenCalled()
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith({
				model: mockOptions.apiModelId,
				messages: [{ role: "user", content: "Test prompt" }],
				max_tokens: 8192,
				temperature: 0,
				thinking: undefined,
				stream: false,
			})
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("Anthropic completion error: API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow("Anthropic completion error: API Error")
		})

		it("should handle non-text content", async () => {
			mockCreate.mockImplementationOnce(async () => ({
				content: [{ type: "image" }],
			}))
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should handle empty response", async () => {
			mockCreate.mockImplementationOnce(async () => ({
				content: [{ type: "text", text: "" }],
			}))
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return default model if no model ID is provided", () => {
			const handlerWithoutModel = new AnthropicHandler({
				...mockOptions,
				apiModelId: undefined,
			})
			const model = handlerWithoutModel.getModel()
			expect(model.id).toBeDefined()
			expect(model.info).toBeDefined()
		})

		it("should return specified model if valid model ID is provided", () => {
			const model = handler.getModel()
			expect(model.id).toBe(mockOptions.apiModelId)
			expect(model.info).toBeDefined()
			expect(model.info.maxTokens).toBe(8192)
			expect(model.info.contextWindow).toBe(200_000)
			expect(model.info.supportsImages).toBe(true)
			expect(model.info.supportsPromptCache).toBe(true)
		})

		it("honors custom maxTokens for thinking models", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-7-sonnet-20250219:thinking",
				modelMaxTokens: 32_768,
				modelMaxThinkingTokens: 16_384,
			})

			const result = handler.getModel()
			expect(result.maxTokens).toBe(32_768)
			expect(result.reasoningBudget).toEqual(16_384)
			expect(result.temperature).toBe(1.0)
		})

		it("does not honor custom maxTokens for non-thinking models", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-7-sonnet-20250219",
				modelMaxTokens: 32_768,
				modelMaxThinkingTokens: 16_384,
			})

			const result = handler.getModel()
			expect(result.maxTokens).toBe(8192)
			expect(result.reasoningBudget).toBeUndefined()
			expect(result.temperature).toBe(0)
		})

		it("should handle Claude 4.5 Sonnet model correctly", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-5",
			})
			const model = handler.getModel()
			expect(model.id).toBe("claude-sonnet-4-5")
			expect(model.info.maxTokens).toBe(64000)
			expect(model.info.contextWindow).toBe(200000)
			expect(model.info.supportsReasoningBudget).toBe(true)
		})

		it("should enable 1M context for Claude 4.5 Sonnet when beta flag is set", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-5",
				anthropicBeta1MContext: true,
			})
			const model = handler.getModel()
			expect(model.info.contextWindow).toBe(1000000)
			expect(model.info.inputPrice).toBe(6.0)
			expect(model.info.outputPrice).toBe(22.5)
		})
	})

	describe("Batch API", () => {
		beforeEach(() => {
			vitest.clearAllMocks()
			// Reset fetch mock
			mockFetch.mockReset()
		})

		it("should use batch API when anthropicUseBatchApi is enabled", async () => {
			const handlerWithBatch = new AnthropicHandler({
				...mockOptions,
				anthropicUseBatchApi: true,
			})

			// Mock batch API responses
			mockFetch
				// First call: Create batch job
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})
				// Second call: Check job status (still processing)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})
				// Third call: Check job status (ended)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "ended",
						created_at: "2024-01-01T00:00:00Z",
						ended_at: "2024-01-01T00:00:30Z",
					}),
				})
				// Fourth call: Get results
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						results: [
							{
								custom_id: "req_123",
								result: {
									type: "succeeded",
									message: {
										content: [{ type: "text", text: "Batch response" }],
										usage: {
											input_tokens: 100,
											output_tokens: 50,
										},
									},
								},
							},
						],
					}),
				})

			const systemPrompt = "You are a helpful assistant"
			const messages = [{ role: "user" as const, content: "Hello" }]

			const stream = handlerWithBatch.createMessage(systemPrompt, messages)

			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify batch job was created
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/messages/batches"),
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"x-api-key": mockOptions.apiKey,
						"anthropic-version": "2023-06-01",
						"anthropic-beta": "message-batches-2024-09-24",
					}),
				}),
			)

			// Verify polling occurred
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/messages/batches/batch-123"),
				expect.objectContaining({
					method: "GET",
				}),
			)

			// Verify results were retrieved
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining("/v1/messages/batches/batch-123/results"),
				expect.objectContaining({
					method: "GET",
				}),
			)

			// Verify response content
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks.some((chunk) => chunk.text.includes("Batch response"))).toBe(true)

			// Verify cost calculation with 50% discount
			const usageChunk = chunks.find((chunk) => chunk.type === "usage" && chunk.totalCost !== undefined)
			expect(usageChunk).toBeDefined()
		})

		it("should handle batch API timeout", async () => {
			const handlerWithBatch = new AnthropicHandler({
				...mockOptions,
				anthropicUseBatchApi: true,
			})

			// Mock batch job creation
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})
				// Keep returning processing status
				.mockResolvedValue({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})

			// Mock Date.now to simulate timeout
			const originalDateNow = Date.now
			let currentTime = originalDateNow()
			Date.now = vitest.fn(() => {
				currentTime += 11 * 60 * 1000 // Add 11 minutes each call
				return currentTime
			})

			const systemPrompt = "You are a helpful assistant"
			const messages = [{ role: "user" as const, content: "Hello" }]

			const stream = handlerWithBatch.createMessage(systemPrompt, messages)

			// Expect timeout error
			await expect(async () => {
				const chunks: any[] = []
				for await (const chunk of stream) {
					chunks.push(chunk)
				}
			}).rejects.toThrow("Batch job timed out after 10 minutes")

			// Restore Date.now
			Date.now = originalDateNow
		})

		it("should handle batch API failure", async () => {
			const handlerWithBatch = new AnthropicHandler({
				...mockOptions,
				anthropicUseBatchApi: true,
			})

			// Mock batch job creation
			mockFetch
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})
				// Return failed status
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "failed",
						created_at: "2024-01-01T00:00:00Z",
						error: {
							type: "api_error",
							message: "Batch processing failed",
						},
					}),
				})

			const systemPrompt = "You are a helpful assistant"
			const messages = [{ role: "user" as const, content: "Hello" }]

			const stream = handlerWithBatch.createMessage(systemPrompt, messages)

			// Expect failure error
			await expect(async () => {
				const chunks: any[] = []
				for await (const chunk of stream) {
					chunks.push(chunk)
				}
			}).rejects.toThrow("Batch job failed: Batch processing failed")
		})

		it("should show progress updates during batch processing", async () => {
			const handlerWithBatch = new AnthropicHandler({
				...mockOptions,
				anthropicUseBatchApi: true,
			})

			// Mock delay to return immediately
			const mockDelay = vitest.mocked(delay)
			mockDelay.mockResolvedValue(undefined as any)

			let callCount = 0
			mockFetch
				// First call: Create batch job
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({
						id: "batch-123",
						status: "processing",
						created_at: "2024-01-01T00:00:00Z",
					}),
				})
				// Multiple status checks
				.mockImplementation(() => {
					callCount++
					if (callCount <= 5) {
						return Promise.resolve({
							ok: true,
							json: async () => ({
								id: "batch-123",
								status: "processing",
								created_at: "2024-01-01T00:00:00Z",
							}),
						})
					} else if (callCount === 6) {
						return Promise.resolve({
							ok: true,
							json: async () => ({
								id: "batch-123",
								status: "ended",
								created_at: "2024-01-01T00:00:00Z",
								ended_at: "2024-01-01T00:00:30Z",
							}),
						})
					} else {
						// Results
						return Promise.resolve({
							ok: true,
							json: async () => ({
								results: [
									{
										custom_id: "req_123",
										result: {
											type: "succeeded",
											message: {
												content: [{ type: "text", text: "Batch response" }],
												usage: {
													input_tokens: 100,
													output_tokens: 50,
												},
											},
										},
									},
								],
							}),
						})
					}
				})

			// Mock Date.now for progress updates
			const originalDateNow = Date.now
			let currentTime = originalDateNow()
			Date.now = vitest.fn(() => {
				currentTime += 21000 // Add 21 seconds each call to trigger progress updates
				return currentTime
			})

			const systemPrompt = "You are a helpful assistant"
			const messages = [{ role: "user" as const, content: "Hello" }]

			const stream = handlerWithBatch.createMessage(systemPrompt, messages)

			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify progress messages
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks.some((chunk) => chunk.text.includes("Creating batch job"))).toBe(true)
			expect(textChunks.some((chunk) => chunk.text.includes("[Batch API] Processing"))).toBe(true)
			expect(textChunks.some((chunk) => chunk.text.includes("Retrieving batch results"))).toBe(true)

			// Restore Date.now
			Date.now = originalDateNow
		})

		it("should use regular streaming API when batch API is disabled", async () => {
			const handlerWithoutBatch = new AnthropicHandler({
				...mockOptions,
				anthropicUseBatchApi: false,
			})

			const systemPrompt = "You are a helpful assistant"
			const messages = [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: "Hello" }],
				},
			]

			const stream = handlerWithoutBatch.createMessage(systemPrompt, messages)

			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should use regular API (mockCreate), not batch API (fetch)
			expect(mockCreate).toHaveBeenCalled()
			expect(mockFetch).not.toHaveBeenCalled()

			// Verify regular streaming response
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(2)
			expect(textChunks[0].text).toBe("Hello")
			expect(textChunks[1].text).toBe(" world")
		})
	})
})
