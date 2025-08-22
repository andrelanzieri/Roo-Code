// npx vitest run src/api/providers/__tests__/groq.spec.ts

// Mock vscode first to avoid import errors
vitest.mock("vscode", () => ({}))

import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"

import { type GroqModelId, groqDefaultModelId, groqModels } from "@roo-code/types"

import { GroqHandler } from "../groq"

vitest.mock("openai", () => {
	const createMock = vitest.fn()
	return {
		default: vitest.fn(() => ({ chat: { completions: { create: createMock } } })),
	}
})

describe("GroqHandler", () => {
	let handler: GroqHandler
	let mockCreate: any

	beforeEach(() => {
		vitest.clearAllMocks()
		mockCreate = (OpenAI as unknown as any)().chat.completions.create
		handler = new GroqHandler({ groqApiKey: "test-groq-api-key" })
	})

	it("should use the correct Groq base URL", () => {
		new GroqHandler({ groqApiKey: "test-groq-api-key" })
		expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://api.groq.com/openai/v1" }))
	})

	it("should use the provided API key", () => {
		const groqApiKey = "test-groq-api-key"
		new GroqHandler({ groqApiKey })
		expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: groqApiKey }))
	})

	it("should return default model when no model is specified", () => {
		const model = handler.getModel()
		expect(model.id).toBe(groqDefaultModelId)
		expect(model.info).toEqual(groqModels[groqDefaultModelId])
		// Verify prompt caching is enabled
		expect(model.info.supportsPromptCache).toBe(true)
	})

	it("should return specified model when valid model is provided", () => {
		const testModelId: GroqModelId = "llama-3.3-70b-versatile"
		const handlerWithModel = new GroqHandler({ apiModelId: testModelId, groqApiKey: "test-groq-api-key" })
		const model = handlerWithModel.getModel()
		expect(model.id).toBe(testModelId)
		expect(model.info).toEqual(groqModels[testModelId])
		// Verify prompt caching is enabled
		expect(model.info.supportsPromptCache).toBe(true)
	})

	it("completePrompt method should return text from Groq API", async () => {
		const expectedResponse = "This is a test response from Groq"
		mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: expectedResponse } }] })
		const result = await handler.completePrompt("test prompt")
		expect(result).toBe(expectedResponse)
	})

	it("should handle errors in completePrompt", async () => {
		const errorMessage = "Groq API error"
		mockCreate.mockRejectedValueOnce(new Error(errorMessage))
		await expect(handler.completePrompt("test prompt")).rejects.toThrow(`Groq completion error: ${errorMessage}`)
	})

	it("createMessage should yield text content from stream", async () => {
		const testContent = "This is test content from Groq stream"

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

	it("createMessage should yield usage data from stream", async () => {
		mockCreate.mockImplementationOnce(() => {
			return {
				[Symbol.asyncIterator]: () => ({
					next: vitest
						.fn()
						.mockResolvedValueOnce({
							done: false,
							value: { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 20 } },
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
			cacheWriteTokens: 0,
			cacheReadTokens: 0,
		})
	})

	it("createMessage should pass correct parameters to Groq client", async () => {
		const modelId: GroqModelId = "llama-3.1-8b-instant"
		const modelInfo = groqModels[modelId]
		const handlerWithModel = new GroqHandler({
			apiModelId: modelId,
			groqApiKey: "test-groq-api-key",
			modelTemperature: 0.5, // Explicitly set temperature for this test
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

		const systemPrompt = "Test system prompt for Groq"
		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message for Groq" }]

		const messageGenerator = handlerWithModel.createMessage(systemPrompt, messages)
		await messageGenerator.next()

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: modelId,
				max_tokens: modelInfo.maxTokens,
				temperature: 0.5,
				messages: expect.arrayContaining([{ role: "system", content: systemPrompt }]),
				stream: true,
				stream_options: { include_usage: true },
			}),
			undefined,
		)
	})

	it("should omit temperature when modelTemperature is undefined", async () => {
		const modelId: GroqModelId = "llama-3.1-8b-instant"
		const handlerWithoutTemp = new GroqHandler({
			apiModelId: modelId,
			groqApiKey: "test-groq-api-key",
			// modelTemperature is not set
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

		const systemPrompt = "Test system prompt"
		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message" }]

		const messageGenerator = handlerWithoutTemp.createMessage(systemPrompt, messages)
		await messageGenerator.next()

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: modelId,
				messages: expect.arrayContaining([{ role: "system", content: systemPrompt }]),
				stream: true,
			}),
			undefined,
		)

		// Verify temperature is NOT included
		const callArgs = mockCreate.mock.calls[0][0]
		expect(callArgs).not.toHaveProperty("temperature")
	})

	it("should include temperature when modelTemperature is explicitly set", async () => {
		const modelId: GroqModelId = "llama-3.1-8b-instant"
		const handlerWithTemp = new GroqHandler({
			apiModelId: modelId,
			groqApiKey: "test-groq-api-key",
			modelTemperature: 0.7,
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

		const systemPrompt = "Test system prompt"
		const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message" }]

		const messageGenerator = handlerWithTemp.createMessage(systemPrompt, messages)
		await messageGenerator.next()

		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: modelId,
				temperature: 0.7,
				messages: expect.arrayContaining([{ role: "system", content: systemPrompt }]),
				stream: true,
			}),
			undefined,
		)
	})

	it("createMessage should handle cached tokens from Groq API", async () => {
		const testContent = "This is test content from Groq stream"
		const cachedTokens = 50

		mockCreate.mockImplementationOnce(() => {
			return {
				[Symbol.asyncIterator]: () => ({
					next: vitest
						.fn()
						.mockResolvedValueOnce({
							done: false,
							value: { choices: [{ delta: { content: testContent } }] },
						})
						.mockResolvedValueOnce({
							done: false,
							value: {
								choices: [{ delta: {} }],
								usage: {
									prompt_tokens: 100,
									completion_tokens: 20,
									prompt_tokens_details: {
										cached_tokens: cachedTokens,
									},
								},
							},
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

		// Should have text chunk and usage chunk
		expect(chunks).toHaveLength(2)
		expect(chunks[0]).toEqual({ type: "text", text: testContent })

		// Usage chunk should properly handle cached tokens
		expect(chunks[1]).toEqual({
			type: "usage",
			inputTokens: 50, // 100 total - 50 cached = 50 non-cached
			outputTokens: 20,
			cacheWriteTokens: 0, // Groq doesn't track cache writes
			cacheReadTokens: 50,
		})
	})

	it("createMessage should handle missing cache information gracefully", async () => {
		mockCreate.mockImplementationOnce(() => {
			return {
				[Symbol.asyncIterator]: () => ({
					next: vitest
						.fn()
						.mockResolvedValueOnce({
							done: false,
							value: {
								choices: [{ delta: {} }],
								usage: {
									prompt_tokens: 100,
									completion_tokens: 20,
									// No prompt_tokens_details
								},
							},
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

		// Should handle missing cache information gracefully
		expect(chunks).toHaveLength(1)
		expect(chunks[0]).toEqual({
			type: "usage",
			inputTokens: 100, // No cached tokens, so all are non-cached
			outputTokens: 20,
			cacheWriteTokens: 0,
			cacheReadTokens: 0, // Default to 0 when not provided
		})

		describe("Prompt Caching", () => {
			it("should use caching strategy when groqUsePromptCache is enabled", async () => {
				const handlerWithCache = new GroqHandler({
					groqApiKey: "test-groq-api-key",
					groqUsePromptCache: true,
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

				const systemPrompt = "Test system prompt for caching"
				const messages: Anthropic.Messages.MessageParam[] = [
					{ role: "user", content: "First message" },
					{ role: "assistant", content: "First response" },
					{ role: "user", content: "Second message" },
				]

				const messageGenerator = handlerWithCache.createMessage(systemPrompt, messages)
				await messageGenerator.next()

				// Verify that the messages were formatted with the system prompt
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: expect.arrayContaining([
							{ role: "system", content: systemPrompt },
							{ role: "user", content: "First message" },
							{ role: "assistant", content: "First response" },
							{ role: "user", content: "Second message" },
						]),
					}),
					undefined,
				)
			})

			it("should not use caching strategy when groqUsePromptCache is disabled", async () => {
				const handlerWithoutCache = new GroqHandler({
					groqApiKey: "test-groq-api-key",
					groqUsePromptCache: false,
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

				const systemPrompt = "Test system prompt without caching"
				const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message" }]

				const messageGenerator = handlerWithoutCache.createMessage(systemPrompt, messages)
				await messageGenerator.next()

				// Verify standard formatting is used
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: expect.arrayContaining([
							{ role: "system", content: systemPrompt },
							{ role: "user", content: "Test message" },
						]),
					}),
					undefined,
				)
			})

			it("should handle multiple cache read token field names", async () => {
				const testContent = "Test content"

				// Test different field names that Groq might use for cached tokens
				const cacheFieldVariations = [
					{ cached_tokens: 30 },
					{ cache_read_input_tokens: 40 },
					{ cache_tokens: 50 },
				]

				for (const cacheFields of cacheFieldVariations) {
					vitest.clearAllMocks()

					mockCreate.mockImplementationOnce(() => {
						return {
							[Symbol.asyncIterator]: () => ({
								next: vitest
									.fn()
									.mockResolvedValueOnce({
										done: false,
										value: { choices: [{ delta: { content: testContent } }] },
									})
									.mockResolvedValueOnce({
										done: false,
										value: {
											choices: [{ delta: {} }],
											usage: {
												prompt_tokens: 100,
												completion_tokens: 20,
												prompt_tokens_details: cacheFields,
											},
										},
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

					// Get the expected cached tokens value
					const expectedCachedTokens = Object.values(cacheFields)[0]

					// Should properly extract cached tokens from any of the field names
					expect(chunks[1]).toEqual({
						type: "usage",
						inputTokens: 100 - expectedCachedTokens,
						outputTokens: 20,
						cacheWriteTokens: 0,
						cacheReadTokens: expectedCachedTokens,
					})
				}
			})

			it("should maintain conversation cache state across multiple messages", async () => {
				const handlerWithCache = new GroqHandler({
					groqApiKey: "test-groq-api-key",
					groqUsePromptCache: true,
				})

				mockCreate.mockImplementation(() => {
					return {
						[Symbol.asyncIterator]: () => ({
							async next() {
								return { done: true }
							},
						}),
					}
				})

				const systemPrompt = "System prompt for conversation"
				const firstMessages: Anthropic.Messages.MessageParam[] = [
					{ role: "user", content: "First user message" },
				]

				// First call
				const firstGenerator = handlerWithCache.createMessage(systemPrompt, firstMessages)
				await firstGenerator.next()

				// Add more messages for second call
				const secondMessages: Anthropic.Messages.MessageParam[] = [
					...firstMessages,
					{ role: "assistant", content: "First assistant response" },
					{ role: "user", content: "Second user message" },
				]

				// Second call with extended conversation
				const secondGenerator = handlerWithCache.createMessage(systemPrompt, secondMessages)
				await secondGenerator.next()

				// Both calls should have been made
				expect(mockCreate).toHaveBeenCalledTimes(2)

				// Verify the second call has all messages
				const secondCallArgs = mockCreate.mock.calls[1][0]
				expect(secondCallArgs.messages).toHaveLength(4) // system + 3 messages
			})

			it("should handle complex message content with caching", async () => {
				const handlerWithCache = new GroqHandler({
					groqApiKey: "test-groq-api-key",
					groqUsePromptCache: true,
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

				const systemPrompt = "System prompt"
				const messages: Anthropic.Messages.MessageParam[] = [
					{
						role: "user",
						content: [
							{ type: "text", text: "Part 1" },
							{ type: "text", text: "Part 2" },
						],
					},
					{
						role: "assistant",
						content: [
							{ type: "text", text: "Response part 1" },
							{ type: "text", text: "Response part 2" },
						],
					},
				]

				const messageGenerator = handlerWithCache.createMessage(systemPrompt, messages)
				await messageGenerator.next()

				// Verify that complex content is properly converted
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: expect.arrayContaining([
							{ role: "system", content: systemPrompt },
							{ role: "user", content: "Part 1\nPart 2" },
							{ role: "assistant", content: "Response part 1\nResponse part 2" },
						]),
					}),
					undefined,
				)
			})

			it("should respect model's supportsPromptCache flag", async () => {
				// Mock the getModel method to return a model without cache support
				const modelId: GroqModelId = "llama-3.1-8b-instant"

				const handlerWithCache = new GroqHandler({
					apiModelId: modelId,
					groqApiKey: "test-groq-api-key",
					groqUsePromptCache: true, // Enabled but we'll mock the model to not support it
				})

				// Override getModel to return a model without cache support
				const originalGetModel = handlerWithCache.getModel.bind(handlerWithCache)
				handlerWithCache.getModel = () => {
					const model = originalGetModel()
					return {
						...model,
						info: {
							...model.info,
							supportsPromptCache: false, // Override to false for this test
						},
					}
				}

				mockCreate.mockImplementationOnce(() => {
					return {
						[Symbol.asyncIterator]: () => ({
							async next() {
								return { done: true }
							},
						}),
					}
				})

				const systemPrompt = "Test system prompt"
				const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Test message" }]

				const messageGenerator = handlerWithCache.createMessage(systemPrompt, messages)
				await messageGenerator.next()

				// Should use standard formatting when model doesn't support caching
				expect(mockCreate).toHaveBeenCalledWith(
					expect.objectContaining({
						messages: expect.arrayContaining([
							{ role: "system", content: systemPrompt },
							{ role: "user", content: "Test message" },
						]),
					}),
					undefined,
				)
			})
		})
	})
})
