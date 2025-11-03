import { describe, it, expect, vi, beforeEach } from "vitest"
import OpenAI from "openai"

import { OpenAiCompatibleHandler } from "../openai-compatible"

vi.mock("openai")

describe("OpenAiCompatibleHandler", () => {
	let handler: OpenAiCompatibleHandler
	let mockCreate: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockCreate = vi.fn()
		;(OpenAI as any).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		}))
	})

	describe("initialization", () => {
		it("should create handler with valid configuration", () => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "test-api-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)

			expect(handler).toBeInstanceOf(OpenAiCompatibleHandler)
			expect(OpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://integrate.api.nvidia.com/v1",
					apiKey: "test-api-key",
				}),
			)
		})

		it("should throw error when base URL is missing", () => {
			expect(
				() =>
					new OpenAiCompatibleHandler({
						openAiCompatibleApiKey: "test-api-key",
					} as any),
			).toThrow("OpenAI-compatible base URL is required")
		})

		it("should throw error when API key is missing", () => {
			expect(
				() =>
					new OpenAiCompatibleHandler({
						openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
					} as any),
			).toThrow("OpenAI-compatible API key is required")
		})

		it("should use fallback properties if openAiCompatible ones are not present", () => {
			handler = new OpenAiCompatibleHandler({
				openAiBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiApiKey: "test-api-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)

			expect(handler).toBeInstanceOf(OpenAiCompatibleHandler)
			expect(OpenAI).toHaveBeenCalledWith(
				expect.objectContaining({
					baseURL: "https://integrate.api.nvidia.com/v1",
					apiKey: "test-api-key",
				}),
			)
		})

		it("should use default model when apiModelId is not provided", () => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "test-api-key",
			} as any)

			const model = handler.getModel()
			expect(model.id).toBe("default")
		})

		it("should support NVIDIA API with MiniMax model", () => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "nvapi-test-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)

			const model = handler.getModel()
			expect(model.id).toBe("minimaxai/minimax-m2")
			expect(model.info.maxTokens).toBe(128000)
			expect(model.info.contextWindow).toBe(128000)
		})

		it("should support any custom OpenAI-compatible endpoint", () => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://custom.api.example.com/v1",
				openAiCompatibleApiKey: "custom-api-key",
				apiModelId: "custom-model",
			} as any)

			const model = handler.getModel()
			expect(model.id).toBe("custom-model")
		})
	})

	describe("getModel", () => {
		beforeEach(() => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "test-api-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)
		})

		it("should return correct model info", () => {
			const model = handler.getModel()
			expect(model.id).toBe("minimaxai/minimax-m2")
			expect(model.info).toMatchObject({
				maxTokens: 128000,
				contextWindow: 128000,
				supportsPromptCache: false,
				supportsImages: false,
			})
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "test-api-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)
		})

		it("should create streaming request with correct parameters", async () => {
			const mockStream = (async function* () {
				yield {
					choices: [
						{
							delta: { content: "Test response" },
						},
					],
				}
				yield {
					choices: [
						{
							delta: {},
						},
					],
					usage: {
						prompt_tokens: 10,
						completion_tokens: 5,
					},
				}
			})()

			mockCreate.mockReturnValue(mockStream)

			const systemPrompt = "You are a helpful assistant."
			const messages = [
				{
					role: "user" as const,
					content: "Hello, can you help me?",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "minimaxai/minimax-m2",
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello, can you help me?" },
					],
					stream: true,
					stream_options: { include_usage: true },
					temperature: 0.7,
					max_tokens: 25600, // 20% of context window (128000)
				}),
				undefined,
			)

			expect(chunks).toContainEqual(
				expect.objectContaining({
					type: "text",
					text: "Test response",
				}),
			)

			expect(chunks).toContainEqual(
				expect.objectContaining({
					type: "usage",
					inputTokens: 10,
					outputTokens: 5,
				}),
			)
		})
	})

	describe("completePrompt", () => {
		beforeEach(() => {
			handler = new OpenAiCompatibleHandler({
				openAiCompatibleBaseUrl: "https://integrate.api.nvidia.com/v1",
				openAiCompatibleApiKey: "test-api-key",
				apiModelId: "minimaxai/minimax-m2",
			} as any)
		})

		it("should complete prompt correctly", async () => {
			const mockResponse = {
				choices: [
					{
						message: { content: "Completed response" },
					},
				],
			}

			mockCreate.mockResolvedValue(mockResponse)

			const result = await handler.completePrompt("Complete this: Hello")

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "minimaxai/minimax-m2",
					messages: [{ role: "user", content: "Complete this: Hello" }],
				}),
			)

			expect(result).toBe("Completed response")
		})

		it("should return empty string when no content", async () => {
			const mockResponse = {
				choices: [
					{
						message: { content: null },
					},
				],
			}

			mockCreate.mockResolvedValue(mockResponse)

			const result = await handler.completePrompt("Complete this")

			expect(result).toBe("")
		})
	})
})
