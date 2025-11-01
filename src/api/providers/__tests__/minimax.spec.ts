// npx vitest run src/api/providers/__tests__/minimax.spec.ts

vitest.mock("vscode", () => ({
	workspace: {
		getConfiguration: vitest.fn().mockReturnValue({
			get: vitest.fn().mockReturnValue(600), // Default timeout in seconds
		}),
	},
}))

import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"

import { type MinimaxModelId, minimaxDefaultModelId, minimaxModels } from "@roo-code/types"

import { MiniMaxHandler } from "../minimax"

vitest.mock("openai", () => {
	const createMock = vitest.fn()
	return {
		default: vitest.fn(() => ({ chat: { completions: { create: createMock } } })),
	}
})

describe("MiniMaxHandler", () => {
	let handler: MiniMaxHandler
	let mockCreate: any

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate = (OpenAI as unknown as any)().chat.completions.create
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
			expect(OpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://api.minimax.io/v1",
				}),
			)
		})

		it("should use the provided API key", () => {
			const minimaxApiKey = "test-minimax-api-key"
			new MiniMaxHandler({ minimaxApiKey })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: minimaxApiKey }))
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
			expect(model.info.supportsPromptCache).toBe(false)
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
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.minimaxi.com/v1" }))
		})

		it("should use the provided API key for China", () => {
			const minimaxApiKey = "test-minimax-api-key"
			new MiniMaxHandler({ minimaxApiKey, minimaxBaseUrl: "https://api.minimaxi.com/v1" })
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: minimaxApiKey }))
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
			expect(OpenAI).toHaveBeenCalledWith(
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
	})

	describe("API Methods", () => {
		beforeEach(() => {
			handler = new MiniMaxHandler({ minimaxApiKey: "test-minimax-api-key" })
		})

		it("completePrompt method should return text from MiniMax API", async () => {
			const expectedResponse = "This is a test response from MiniMax"
			mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: expectedResponse } }] })
			const result = await handler.completePrompt("test prompt")
			expect(result).toBe(expectedResponse)
		})

		it("should handle errors in completePrompt", async () => {
			const errorMessage = "MiniMax API error"
			mockCreate.mockRejectedValueOnce(new Error(errorMessage))
			await expect(handler.completePrompt("test prompt")).rejects.toThrow()
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
								value: { choices: [{ delta: { content: testContent } }] },
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

		it("should handle reasoning tags (<think>) from stream", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vitest
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: { choices: [{ delta: { content: "<think>Let me think" } }] },
							})
							.mockResolvedValueOnce({
								done: false,
								value: { choices: [{ delta: { content: " about this</think>" } }] },
							})
							.mockResolvedValueOnce({
								done: false,
								value: { choices: [{ delta: { content: "The answer is 42" } }] },
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const chunks = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// XmlMatcher yields chunks as they're processed
			expect(chunks).toEqual([
				{ type: "reasoning", text: "Let me think" },
				{ type: "reasoning", text: " about this" },
				{ type: "text", text: "The answer is 42" },
			])
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
									choices: [{ delta: {} }],
									usage: { prompt_tokens: 10, completion_tokens: 20 },
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = handler.createMessage("system prompt", [])
			const firstChunk = await stream.next()

			expect(firstChunk.done).toBe(false)
			expect(firstChunk.value).toEqual({ type: "usage", inputTokens: 10, outputTokens: 20 })
		})

		it("createMessage should pass correct parameters to MiniMax client", async () => {
			const modelId: MinimaxModelId = "MiniMax-M2"
			const modelInfo = minimaxModels[modelId]
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
					max_tokens: Math.min(modelInfo.maxTokens, Math.ceil(modelInfo.contextWindow * 0.2)),
					temperature: 1,
					messages: expect.arrayContaining([{ role: "system", content: systemPrompt }]),
					stream: true,
					stream_options: { include_usage: true },
				}),
				undefined,
			)
		})

		it("should use temperature 1 by default", async () => {
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
					temperature: 1,
				}),
				undefined,
			)
		})
	})

	describe("Model Configuration", () => {
		it("should correctly configure MiniMax-M2 model properties", () => {
			const model = minimaxModels["MiniMax-M2"]
			expect(model.maxTokens).toBe(16_384)
			expect(model.contextWindow).toBe(192_000)
			expect(model.supportsImages).toBe(false)
			expect(model.supportsPromptCache).toBe(false)
			expect(model.inputPrice).toBe(0.3)
			expect(model.outputPrice).toBe(1.2)
		})
	})
})
