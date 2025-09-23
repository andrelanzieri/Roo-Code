// npx vitest run api/providers/__tests__/openai-architecture.spec.ts

import { OpenAiHandler } from "../openai"
import { OpenAIChatCompletionsHandler } from "../openai-chat-completions"
import { OpenAIResponsesHandler } from "../openai-responses"
import { ApiHandlerOptions } from "../../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"

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
			responses: {
				create: vitest.fn().mockImplementation(async (options) => {
					// Mock Responses API stream
					return {
						[Symbol.asyncIterator]: async function* () {
							yield {
								type: "response.text.delta",
								delta: "Responses API response",
							}
							yield {
								type: "response.done",
								response: {
									id: "resp_123",
									usage: {
										input_tokens: 10,
										output_tokens: 5,
									},
								},
							}
						},
					}
				}),
			},
		})),
		AzureOpenAI: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
	}
})

describe("OpenAI Architecture Separation", () => {
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "gpt-4",
			openAiBaseUrl: "https://api.openai.com/v1",
		}
		mockCreate.mockClear()
	})

	describe("Handler Routing", () => {
		it("should use Chat Completions handler by default", () => {
			const handler = new OpenAiHandler(mockOptions)
			expect(handler.getApiType()).toBe("chat-completions")
		})

		it("should use Responses API handler for GPT-5 models", () => {
			const gpt5Options = {
				...mockOptions,
				openAiModelId: "gpt-5-turbo",
			}
			const handler = new OpenAiHandler(gpt5Options)
			expect(handler.getApiType()).toBe("responses")
		})

		it("should use Responses API handler when URL contains /v1/responses", () => {
			const responsesOptions = {
				...mockOptions,
				openAiBaseUrl: "https://api.openai.com/v1/responses",
			}
			const handler = new OpenAiHandler(responsesOptions)
			expect(handler.getApiType()).toBe("responses")
		})

		it("should use Responses API handler when configured for OpenAI Native", () => {
			const nativeOptions: ApiHandlerOptions = {
				openAiNativeApiKey: "test-native-key",
				openAiModelId: "gpt-4",
			}
			const handler = new OpenAiHandler(nativeOptions)
			expect(handler.getApiType()).toBe("responses")
		})

		it("should use Chat Completions handler for standard OpenAI models", () => {
			const handler = new OpenAiHandler(mockOptions)
			expect(handler.getApiType()).toBe("chat-completions")
		})

		it("should use Chat Completions handler for O3 models", () => {
			const o3Options = {
				...mockOptions,
				openAiModelId: "o3-mini",
			}
			const handler = new OpenAiHandler(o3Options)
			expect(handler.getApiType()).toBe("chat-completions")
		})
	})

	describe("Chat Completions Handler", () => {
		it("should handle streaming messages correctly", async () => {
			const handler = new OpenAIChatCompletionsHandler(mockOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

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

		it("should handle O3 family models with special formatting", async () => {
			const o3Options = {
				...mockOptions,
				openAiModelId: "o3-mini",
			}
			const handler = new OpenAIChatCompletionsHandler(o3Options)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			await stream.next()

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "o3-mini",
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: "developer",
							content: expect.stringContaining("Formatting re-enabled"),
						}),
					]),
				}),
				{},
			)
		})

		it("should handle DeepSeek reasoner models", async () => {
			const deepseekOptions = {
				...mockOptions,
				openAiModelId: "deepseek-reasoner",
			}
			const handler = new OpenAIChatCompletionsHandler(deepseekOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
		})
	})

	describe("Responses API Handler", () => {
		it("should handle streaming responses correctly", async () => {
			const responsesOptions = {
				...mockOptions,
				openAiBaseUrl: "https://api.openai.com/v1/responses",
			}
			const handler = new OpenAIResponsesHandler(responsesOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Responses API response")
		})

		it("should maintain conversation continuity with response IDs", () => {
			const handler = new OpenAIResponsesHandler(mockOptions)

			// Initially should have no response ID
			expect(handler.getLastResponseId()).toBeUndefined()

			// Set a response ID
			handler.setResponseId("resp_123")
			expect(handler.getLastResponseId()).toBe("resp_123")
		})

		it("should format messages correctly for Responses API", async () => {
			const handler = new OpenAIResponsesHandler(mockOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
				{
					role: "assistant",
					content: "Hi there!",
				},
				{
					role: "user",
					content: "How are you?",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)
			await stream.next()

			const responsesApi = (handler as any).client.responses
			expect(responsesApi.create).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4",
					instructions: systemPrompt,
					input: expect.arrayContaining([
						expect.objectContaining({
							role: "user",
							content: expect.arrayContaining([
								expect.objectContaining({
									type: "input_text",
									text: "Hello!",
								}),
							]),
						}),
					]),
				}),
			)
		})
	})

	describe("Integration with Main Handler", () => {
		it("should delegate to the correct handler based on configuration", async () => {
			// Test Chat Completions delegation
			const chatHandler = new OpenAiHandler(mockOptions)
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello!",
				},
			]

			const chatStream = chatHandler.createMessage(systemPrompt, messages)
			const chatChunks: any[] = []
			for await (const chunk of chatStream) {
				chatChunks.push(chunk)
			}

			expect(chatChunks.length).toBeGreaterThan(0)
			expect(chatHandler.getApiType()).toBe("chat-completions")

			// Test Responses API delegation
			const responsesOptions = {
				...mockOptions,
				openAiModelId: "gpt-5-turbo",
			}
			const responsesHandler = new OpenAiHandler(responsesOptions)

			const responsesStream = responsesHandler.createMessage(systemPrompt, messages)
			const responsesChunks: any[] = []
			for await (const chunk of responsesStream) {
				responsesChunks.push(chunk)
			}

			expect(responsesChunks.length).toBeGreaterThan(0)
			expect(responsesHandler.getApiType()).toBe("responses")
		})

		it("should handle completePrompt through the correct handler", async () => {
			const handler = new OpenAiHandler(mockOptions)
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
		})

		it("should expose response ID methods only for Responses API", () => {
			// Chat Completions handler should return undefined
			const chatHandler = new OpenAiHandler(mockOptions)
			expect(chatHandler.getLastResponseId()).toBeUndefined()
			chatHandler.setResponseId("test_id") // Should not throw but do nothing
			expect(chatHandler.getLastResponseId()).toBeUndefined()

			// Responses API handler should work
			const responsesOptions = {
				...mockOptions,
				openAiModelId: "gpt-5-turbo",
			}
			const responsesHandler = new OpenAiHandler(responsesOptions)
			responsesHandler.setResponseId("resp_456")
			expect(responsesHandler.getLastResponseId()).toBe("resp_456")
		})
	})

	describe("Error Handling", () => {
		it("should handle errors in Chat Completions handler", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			const handler = new OpenAIChatCompletionsHandler(mockOptions)

			const stream = handler.createMessage("system", [{ role: "user", content: "test" }])

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("API Error")
		})

		it("should handle errors in Responses API handler", async () => {
			const responsesApi = vitest.fn().mockRejectedValueOnce(new Error("Responses API Error"))
			vitest.mocked((global as any).OpenAI).mockImplementationOnce(() => ({
				responses: {
					create: responsesApi,
				},
			}))

			const handler = new OpenAIResponsesHandler(mockOptions)
			const stream = handler.createMessage("system", [{ role: "user", content: "test" }])

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow()
		})
	})
})
