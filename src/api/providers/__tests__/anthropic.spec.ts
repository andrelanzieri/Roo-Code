// npx vitest run src/api/providers/__tests__/anthropic.spec.ts

import { AnthropicHandler } from "../anthropic"
import { ApiHandlerOptions } from "../../../shared/api"

const mockCreate = vitest.fn()

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

		it("should enable 1M context window when anthropicBeta1MContext is true for Claude Sonnet 4", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-20250514",
				anthropicBeta1MContext: true,
			})

			const model = handler.getModel()

			// Should have 1M context window when enabled
			expect(model.info.contextWindow).toBe(1_000_000)
			// Should use tier pricing for >200K context
			expect(model.info.inputPrice).toBe(6.0)
			expect(model.info.outputPrice).toBe(22.5)
			expect(model.info.cacheWritesPrice).toBe(7.5)
			expect(model.info.cacheReadsPrice).toBe(0.6)
		})

		it("should use default context window when anthropicBeta1MContext is false for Claude Sonnet 4", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-20250514",
				anthropicBeta1MContext: false,
			})

			const model = handler.getModel()

			// Should use default context window (200k)
			expect(model.info.contextWindow).toBe(200_000)
			// Should use default pricing for ≤200K context
			expect(model.info.inputPrice).toBe(3.0)
			expect(model.info.outputPrice).toBe(15.0)
			expect(model.info.cacheWritesPrice).toBe(3.75)
			expect(model.info.cacheReadsPrice).toBe(0.3)
		})

		it("should not affect context window for non-Claude Sonnet 4 models", () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-5-sonnet-20241022",
				anthropicBeta1MContext: true,
			})

			const model = handler.getModel()

			// Should use default context window for non-Sonnet 4 models
			expect(model.info.contextWindow).toBe(200_000)
		})
	})

	describe("createMessage with 1M context beta", () => {
		it("should include context-1m-2025-08-07 beta header when enabled for Claude Sonnet 4", async () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-20250514",
				anthropicBeta1MContext: true,
			})

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that the create method was called with the correct beta headers
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-sonnet-4-20250514",
				}),
				expect.objectContaining({
					headers: expect.objectContaining({
						"anthropic-beta": expect.stringContaining("context-1m-2025-08-07"),
					}),
				}),
			)

			// Verify that both betas are included
			const callArgs = mockCreate.mock.calls[0]
			const headers = callArgs[1]?.headers
			expect(headers?.["anthropic-beta"]).toContain("prompt-caching-2024-07-31")
			expect(headers?.["anthropic-beta"]).toContain("context-1m-2025-08-07")
		})

		it("should not include context-1m beta header when disabled for Claude Sonnet 4", async () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-sonnet-4-20250514",
				anthropicBeta1MContext: false,
			})

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that the create method was called without the 1M context beta
			const callArgs = mockCreate.mock.calls[0]
			const headers = callArgs[1]?.headers
			expect(headers?.["anthropic-beta"]).toContain("prompt-caching-2024-07-31")
			expect(headers?.["anthropic-beta"]).not.toContain("context-1m-2025-08-07")
		})

		it("should handle thinking models with 1M context beta correctly", async () => {
			const handler = new AnthropicHandler({
				apiKey: "test-api-key",
				apiModelId: "claude-3-7-sonnet-20250219:thinking",
				anthropicBeta1MContext: true, // This shouldn't affect non-Sonnet 4 models
			})

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify that the 1M context beta is NOT included for non-Sonnet 4 models
			const callArgs = mockCreate.mock.calls[0]
			const headers = callArgs[1]?.headers
			expect(headers?.["anthropic-beta"]).toContain("output-128k-2025-02-19")
			expect(headers?.["anthropic-beta"]).toContain("prompt-caching-2024-07-31")
			expect(headers?.["anthropic-beta"]).not.toContain("context-1m-2025-08-07")
		})
	})
})
