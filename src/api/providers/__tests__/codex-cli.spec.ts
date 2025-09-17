// npx vitest run api/providers/__tests__/codex-cli.spec.ts

import { CodexCliHandler } from "../codex-cli"
import { ApiHandlerOptions } from "../../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { codexCliDefaultModelId } from "@roo-code/types"

const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	const mockConstructor = vitest.fn()
	return {
		__esModule: true,
		default: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate.mockImplementation(async (options) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "Test response", refusal: null },
										finish_reason: "stop",
										index: 0,
									},
								],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									total_tokens: 15,
								},
							}
						}

						return {
							[Symbol.asyncIterator]: async function* () {
								yield {
									choices: [
										{
											delta: { content: "Test response" },
											index: 0,
										},
									],
									usage: null,
								}
								yield {
									choices: [
										{
											delta: {},
											index: 0,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 5,
										total_tokens: 15,
									},
								}
							},
						}
					}),
				},
			},
		})),
	}
})

describe("CodexCliHandler", () => {
	let handler: CodexCliHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		// Reset mocks
		mockCreate.mockClear()

		mockOptions = {
			codexCliPath: "/usr/local/bin/codex",
			codexCliBaseUrl: "http://localhost:3000/v1",
			apiModelId: codexCliDefaultModelId,
		}

		handler = new CodexCliHandler(mockOptions)
	})

	describe("constructor", () => {
		it("should initialize with default values when no options provided", () => {
			const minimalHandler = new CodexCliHandler({})
			expect(minimalHandler).toBeInstanceOf(CodexCliHandler)
			expect(minimalHandler.getModel().id).toBe(codexCliDefaultModelId)
		})

		it("should use provided base URL", () => {
			expect(handler).toBeInstanceOf(CodexCliHandler)
			// The handler should be created successfully with the provided base URL
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "http://custom.local:8080/v1"
			const handlerWithCustomUrl = new CodexCliHandler({
				...mockOptions,
				codexCliBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(CodexCliHandler)
		})

		it("should handle missing session token gracefully", () => {
			const handlerWithoutToken = new CodexCliHandler({})
			expect(handlerWithoutToken).toBeInstanceOf(CodexCliHandler)

			// Should still create handler even without token
			expect(handlerWithoutToken.getModel().id).toBe(codexCliDefaultModelId)
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text" as const,
						text: "Hello!",
					},
				],
			},
		]

		it("should handle streaming responses", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Test response")
		})

		it("should handle non-streaming mode", async () => {
			const nonStreamingHandler = new CodexCliHandler({
				...mockOptions,
				openAiStreamingEnabled: false,
			})

			const stream = nonStreamingHandler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunk = chunks.find((chunk) => chunk.type === "text")
			const usageChunk = chunks.find((chunk) => chunk.type === "usage")

			expect(textChunk).toBeDefined()
			expect(textChunk?.text).toBe("Test response")
			expect(usageChunk).toBeDefined()
			expect(usageChunk?.inputTokens).toBe(10)
			expect(usageChunk?.outputTokens).toBe(5)
		})

		it("should use bearer token authentication", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			// Consume the stream to trigger the API call
			for await (const _chunk of stream) {
			}

			// Verify the OpenAI client was created with bearer token
			expect(vi.mocked(OpenAI)).toHaveBeenCalledWith(
				expect.objectContaining({
					apiKey: expect.any(String), // Session token or "unauthenticated"
					baseURL: "http://localhost:3000/v1",
				}),
			)
		})
	})

	describe("error handling", () => {
		const testMessages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "text" as const,
						text: "Hello",
					},
				],
			},
		]

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))

			const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("API Error")
		})

		it("should handle authentication errors", async () => {
			const authError = new Error("Unauthorized")
			authError.name = "Error"
			;(authError as any).status = 401
			mockCreate.mockRejectedValueOnce(authError)

			const stream = handler.createMessage("system prompt", testMessages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Unauthorized")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: codexCliDefaultModelId,
					messages: [{ role: "user", content: "Test prompt" }],
				}),
			)
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow("Codex CLI completion error: API Error")
		})

		it("should handle empty response", async () => {
			mockCreate.mockImplementationOnce(() => ({
				choices: [{ message: { content: "" } }],
			}))
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info for default model", () => {
			const model = handler.getModel()
			expect(model.id).toBe(codexCliDefaultModelId)
			expect(model.info).toBeDefined()
			expect(model.info?.contextWindow).toBeGreaterThan(0)
		})

		it("should handle custom model ID", () => {
			const customHandler = new CodexCliHandler({
				...mockOptions,
				apiModelId: "gpt-4o",
			})
			const model = customHandler.getModel()
			expect(model.id).toBe("gpt-4o")
		})

		it("should return model info with correct capabilities", () => {
			const model = handler.getModel()
			expect(model.info).toBeDefined()
			expect(model.info?.supportsImages).toBeDefined()
			expect(model.info?.supportsPromptCache).toBeDefined()
		})
	})

	describe("integration with base provider", () => {
		it("should properly extend BaseOpenAiCompatibleProvider", () => {
			expect(handler).toHaveProperty("createMessage")
			expect(handler).toHaveProperty("completePrompt")
			expect(handler).toHaveProperty("getModel")
		})

		it("should handle model switching", () => {
			const handlerWithDifferentModel = new CodexCliHandler({
				...mockOptions,
				apiModelId: "gpt-4o",
			})
			const model = handlerWithDifferentModel.getModel()
			expect(model.id).toBe("gpt-4o")
		})

		it("should respect temperature settings", async () => {
			const handlerWithTemp = new CodexCliHandler({
				...mockOptions,
				modelTemperature: 0.7,
			})

			const stream = handlerWithTemp.createMessage("system", [{ role: "user", content: "test" }])

			// Consume stream to trigger API call
			for await (const _chunk of stream) {
			}

			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]
			expect(callArgs.temperature).toBe(0.7)
		})
	})
})
