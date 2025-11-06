// npx vitest run src/api/providers/__tests__/minimax.spec.ts

vitest.mock("vscode", () => ({
	workspace: {
		getConfiguration: vitest.fn().mockReturnValue({
			get: vitest.fn().mockReturnValue(600), // Default timeout in seconds
		}),
	},
}))

import { Anthropic } from "@anthropic-ai/sdk"

import { type MinimaxModelId, minimaxDefaultModelId, minimaxModels } from "@roo-code/types"

import { MiniMaxHandler } from "../minimax"

vitest.mock("@anthropic-ai/sdk", () => {
	const createMock = vitest.fn()
	const countTokensMock = vitest.fn()
	return {
		Anthropic: vitest.fn(() => ({
			messages: {
				create: createMock,
				countTokens: countTokensMock,
			},
		})),
	}
})

describe("MiniMaxHandler", () => {
	let handler: MiniMaxHandler
	let mockCreate: any
	let mockCountTokens: any

	beforeEach(() => {
		vitest.clearAllMocks()
		const mockClient = (Anthropic as unknown as any)()
		mockCreate = mockClient.messages.create
		mockCountTokens = mockClient.messages.countTokens
	})

	describe("International MiniMax (default)", () => {
		beforeEach(() => {
			handler = new MiniMaxHandler({
				minimaxApiKey: "test-minimax-api-key",
				minimaxBaseUrl: "https://api.minimax.io/v1",
			})
		})

		it("should use the correct international MiniMax base URL by default", () => {
			new MiniMaxHandler({ minimaxApiKey: "test-minimax-api-key" })
			expect(Anthropic).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://api.minimax.io/v1",
				}),
			)
		})

		it("should use the provided API key", () => {
			const minimaxApiKey = "test-minimax-api-key"
			new MiniMaxHandler({ minimaxApiKey })
			expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ apiKey: minimaxApiKey }))
		})

		it("should return default model when no model is specified", () => {
			const model = handler.getModel()
			expect(model.id).toBe(minimaxDefaultModelId)
			expect(model.info).toEqual(minimaxModels[minimaxDefaultModelId])
		})

		it("should return specified model when valid model is provided", () => {
			const testModelId: MinimaxModelId = "MiniMax-M2"
			const handlerWithModel = new MiniMaxHandler({
				apiModelId: testModelId,
				minimaxApiKey: "test-minimax-api-key",
			})
			const model = handlerWithModel.getModel()
			expect(model.id).toBe(testModelId)
			expect(model.info).toEqual(minimaxModels[testModelId])
		})

		it("should return MiniMax-M2 model with correct configuration", () => {
			const testModelId: MinimaxModelId = "MiniMax-M2"
			const handlerWithModel = new MiniMaxHandler({
				apiModelId: testModelId,
				minimaxApiKey: "test-minimax-api-key",
			})
			const model = handlerWithModel.getModel()
			expect(model.id).toBe(testModelId)
			expect(model.info).toEqual(minimaxModels[testModelId])
			expect(model.info.contextWindow).toBe(192_000)
			expect(model.info.maxTokens).toBe(16_384)
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.cacheWritesPrice).toBe(0.375)
			expect(model.info.cacheReadsPrice).toBe(0.03)
		})

		it("should return MiniMax-M2-Stable model with correct configuration", () => {
			const testModelId: MinimaxModelId = "MiniMax-M2-Stable"
			const handlerWithModel = new MiniMaxHandler({
				apiModelId: testModelId,
				minimaxApiKey: "test-minimax-api-key",
			})
			const model = handlerWithModel.getModel()
			expect(model.id).toBe(testModelId)
			expect(model.info).toEqual(minimaxModels[testModelId])
			expect(model.info.contextWindow).toBe(192_000)
			expect(model.info.maxTokens).toBe(16_384)
			expect(model.info.supportsPromptCache).toBe(true)
			expect(model.info.cacheWritesPrice).toBe(0.375)
			expect(model.info.cacheReadsPrice).toBe(0.03)
		})
	})

	describe("China MiniMax", () => {
		beforeEach(() => {
			handler = new MiniMaxHandler({
				minimaxApiKey: "test-minimax-api-key",
				minimaxBaseUrl: "https://api.minimaxi.com/v1",
			})
		})

		it("should use the correct China MiniMax base URL", () => {
			new MiniMaxHandler({
				minimaxApiKey: "test-minimax-api-key",
				minimaxBaseUrl: "https://api.minimaxi.com/v1",
			})
			expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.minimaxi.com/v1" }))
		})

		it("should use the provided API key for China", () => {
			const minimaxApiKey = "test-minimax-api-key"
			new MiniMaxHandler({ minimaxApiKey, minimaxBaseUrl: "https://api.minimaxi.com/v1" })
			expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({ apiKey: minimaxApiKey }))
		})

		it("should return default model when no model is specified", () => {
			const model = handler.getModel()
			expect(model.id).toBe(minimaxDefaultModelId)
			expect(model.info).toEqual(minimaxModels[minimaxDefaultModelId])
		})
	})

	describe("Default behavior", () => {
		it("should default to international base URL when none is specified", () => {
			const handlerDefault = new MiniMaxHandler({ minimaxApiKey: "test-minimax-api-key" })
			expect(Anthropic).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://api.minimax.io/v1",
				}),
			)

			const model = handlerDefault.getModel()
			expect(model.id).toBe(minimaxDefaultModelId)
			expect(model.info).toEqual(minimaxModels[minimaxDefaultModelId])
		})

		it("should default to MiniMax-M2 model", () => {
			const handlerDefault = new MiniMaxHandler({ minimaxApiKey: "test-minimax-api-key" })
			const model = handlerDefault.getModel()
			expect(model.id).toBe("MiniMax-M2")
		})

		it("should throw error when API key is not provided", () => {
			expect(() => new MiniMaxHandler({} as any)).toThrow("MiniMax API key is required")
		})
	})

	describe("API Methods", () => {
		beforeEach(() => {
			handler = new MiniMaxHandler({ minimaxApiKey: "test-minimax-api-key" })
		})

		it("completePrompt method should return text from MiniMax API", async () => {
			const expectedResponse = "This is a test response from MiniMax"
			mockCreate.mockResolvedValueOnce({
				content: [{ type: "text", text: expectedResponse }],
			})
			const result = await handler.completePrompt("test prompt")
			expect(result).toBe(expectedResponse)
			expect(mockCreate).toHaveBeenCalledWith({
				model: "MiniMax-M2",
				max_tokens: 16384,
				temperature: 1.0,
				messages: [{ role: "user", content: "test prompt" }],
				stream: false,
			})
		})

		it("should handle errors in completePrompt", async () => {
			const errorMessage = "MiniMax API error"
			mockCreate.mockRejectedValueOnce(new Error(errorMessage))
			await expect(handler.completePrompt("test prompt")).rejects.toThrow(errorMessage)
		})

		it("createMessage should yield text content from stream", async () => {
			const testContent = "This is test content from MiniMax stream"

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									type: "content_block_start",
									index: 0,
									content_block: { type: "text", text: testContent },
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "text", text: testContent })
		})

		it("createMessage should handle text delta chunks", async () => {
			const testContent = "streaming text"

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									type: "content_block_delta",
									delta: { type: "text_delta", text: testContent },
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "text", text: testContent })
		})

		it("createMessage should yield usage data from stream", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									type: "message_start",
									message: {
										usage: {
											input_tokens: 10,
											output_tokens: 20,
											cache_creation_input_tokens: 5,
											cache_read_input_tokens: 3,
										},
									},
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 20,
				cacheWriteTokens: 5,
				cacheReadTokens: 3,
			})
		})

		it("createMessage should pass correct parameters to MiniMax client with prompt caching", async () => {
			const modelId: MinimaxModelId = "MiniMax-M2"
			const handlerWithModel = new MiniMaxHandler({
				apiModelId: modelId,
				minimaxApiKey: "test-minimax-api-key",
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const systemPrompt = "Test system prompt for MiniMax"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message for MiniMax" }]

			const messageGenerator = handlerWithModel.createMessage(systemPrompt, messages)
			await messageGenerator.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: modelId,
					max_tokens: expect.any(Number),
					temperature: 1.0,
					system: [{ text: systemPrompt, type: "text", cache_control: { type: "ephemeral" } }],
					messages: expect.any(Array),
					stream: true,
				}),
				expect.objectContaining({
					headers: { "anthropic-beta": "prompt-caching-2024-07-31" },
				}),
			)
		})

		it("createMessage should handle reasoning/thinking blocks", async () => {
			const testThinking = "Let me think about this..."

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									type: "content_block_start",
									index: 0,
									content_block: { type: "thinking", thinking: testThinking },
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "reasoning", text: testThinking })
		})

		it("should use temperature 1.0 by default", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const messageGenerator = handler.createMessage("test", [])
			await messageGenerator.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 1.0,
				}),
				expect.any(Object),
			)
		})

		it("should use custom temperature when provided", async () => {
			const customTemperature = 0.7
			const handlerWithTemp = new MiniMaxHandler({
				minimaxApiKey: "test-minimax-api-key",
				modelTemperature: customTemperature,
			})

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						async next() {
							return { done: true }
						},
					}),
				}
			})

			const messageGenerator = handlerWithTemp.createMessage("test", [])
			await messageGenerator.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: customTemperature,
				}),
				expect.any(Object),
			)
		})

		it("countTokens should try API first then fallback to tiktoken", async () => {
			const content = [{ type: "text", text: "test content" }] as Anthropic.Messages.ContentBlockParam[]

			// First test successful API response
			mockCountTokens.mockResolvedValueOnce({ input_tokens: 42 })
			let result = await handler.countTokens(content)
			expect(result).toBe(42)
			expect(mockCountTokens).toHaveBeenCalledWith({
				model: "MiniMax-M2",
				messages: [{ role: "user", content }],
			})

			// Then test API failure with fallback
			mockCountTokens.mockRejectedValueOnce(new Error("Not supported"))
			result = await handler.countTokens(content)
			// Should return a number (tiktoken estimate), exact value depends on tokenizer
			expect(typeof result).toBe("number")
			expect(result).toBeGreaterThan(0)
		})
	})

	describe("Model Configuration", () => {
		it("should correctly configure MiniMax-M2 model properties", () => {
			const model = minimaxModels["MiniMax-M2"]
			expect(model.maxTokens).toBe(16_384)
			expect(model.contextWindow).toBe(192_000)
			expect(model.supportsImages).toBe(false)
			expect(model.supportsPromptCache).toBe(true)
			expect(model.inputPrice).toBe(0.3)
			expect(model.outputPrice).toBe(1.2)
			expect(model.cacheWritesPrice).toBe(0.375)
			expect(model.cacheReadsPrice).toBe(0.03)
		})

		it("should correctly configure MiniMax-M2-Stable model properties", () => {
			const model = minimaxModels["MiniMax-M2-Stable"]
			expect(model.maxTokens).toBe(16_384)
			expect(model.contextWindow).toBe(192_000)
			expect(model.supportsImages).toBe(false)
			expect(model.supportsPromptCache).toBe(true)
			expect(model.inputPrice).toBe(0.3)
			expect(model.outputPrice).toBe(1.2)
			expect(model.cacheWritesPrice).toBe(0.375)
			expect(model.cacheReadsPrice).toBe(0.03)
		})
	})
})
