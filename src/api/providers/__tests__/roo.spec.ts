// npx vitest run api/providers/__tests__/roo.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import { rooDefaultModelId, rooModels } from "@roo-code/types"

import { ApiHandlerOptions } from "../../../shared/api"

// Mock OpenAI client
const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	return {
		__esModule: true,
		default: vitest.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate.mockImplementation(async (options) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "Test response" },
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

// Mock CloudService - Define functions outside to avoid initialization issues
const mockGetSessionToken = vitest.fn()
const mockHasInstance = vitest.fn()

// Create mock functions that we can control
const mockGetSessionTokenFn = vitest.fn()
const mockHasInstanceFn = vitest.fn()

vitest.mock("@roo-code/cloud", () => ({
	CloudService: {
		hasInstance: () => mockHasInstanceFn(),
		get instance() {
			return {
				authService: {
					getSessionToken: () => mockGetSessionTokenFn(),
				},
			}
		},
	},
}))

// Mock i18n
vitest.mock("../../../i18n", () => ({
	t: vitest.fn((key: string) => {
		if (key === "common:errors.roo.authenticationRequired") {
			return "Authentication required for Roo Code Cloud"
		}
		return key
	}),
}))

// Import after mocks are set up
import { RooHandler } from "../roo"
import { CloudService } from "@roo-code/cloud"
import { t } from "../../../i18n"

describe("RooHandler", () => {
	let handler: RooHandler
	let mockOptions: ApiHandlerOptions
	const systemPrompt = "You are a helpful assistant."
	const messages: Anthropic.Messages.MessageParam[] = [
		{
			role: "user",
			content: "Hello!",
		},
	]

	beforeEach(() => {
		mockOptions = {
			apiModelId: "roo/sonic",
		}
		// Set up CloudService mocks for successful authentication
		mockHasInstanceFn.mockReturnValue(true)
		mockGetSessionTokenFn.mockReturnValue("test-session-token")
		mockCreate.mockClear()
		vitest.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with valid session token", () => {
			handler = new RooHandler(mockOptions)
			expect(handler).toBeInstanceOf(RooHandler)
			expect(handler.getModel().id).toBe(mockOptions.apiModelId)
		})

		it("should throw error if CloudService is not available", () => {
			mockHasInstanceFn.mockReturnValue(false)
			expect(() => {
				new RooHandler(mockOptions)
			}).toThrow("Authentication required for Roo Code Cloud")
			expect(t).toHaveBeenCalledWith("common:errors.roo.authenticationRequired")
		})

		it("should throw error if session token is not available", () => {
			mockHasInstanceFn.mockReturnValue(true)
			mockGetSessionTokenFn.mockReturnValue(null)
			expect(() => {
				new RooHandler(mockOptions)
			}).toThrow("Authentication required for Roo Code Cloud")
			expect(t).toHaveBeenCalledWith("common:errors.roo.authenticationRequired")
		})

		it("should initialize with default model if no model specified", () => {
			handler = new RooHandler({})
			expect(handler).toBeInstanceOf(RooHandler)
			expect(handler.getModel().id).toBe(rooDefaultModelId)
		})

		it("should pass correct configuration to base class", () => {
			handler = new RooHandler(mockOptions)
			expect(handler).toBeInstanceOf(RooHandler)
			// The handler should be initialized with correct base URL and API key
			// We can't directly test the parent class constructor, but we can verify the handler works
			expect(handler).toBeDefined()
		})
	})

	describe("createMessage", () => {
		beforeEach(() => {
			handler = new RooHandler(mockOptions)
		})

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

		it("should include usage information", async () => {
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(1)
			expect(usageChunks[0].inputTokens).toBe(10)
			expect(usageChunks[0].outputTokens).toBe(5)
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			const stream = handler.createMessage(systemPrompt, messages)
			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("API Error")
		})

		it("should handle empty response content", async () => {
			mockCreate.mockResolvedValueOnce({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [
							{
								delta: { content: null },
								index: 0,
							},
						],
						usage: {
							prompt_tokens: 10,
							completion_tokens: 0,
							total_tokens: 10,
						},
					}
				},
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(0)
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(1)
		})

		it("should handle multiple messages in conversation", async () => {
			const multipleMessages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "First message" },
				{ role: "assistant", content: "First response" },
				{ role: "user", content: "Second message" },
			]

			const stream = handler.createMessage(systemPrompt, multipleMessages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					messages: expect.arrayContaining([
						expect.objectContaining({ role: "system", content: systemPrompt }),
						expect.objectContaining({ role: "user", content: "First message" }),
						expect.objectContaining({ role: "assistant", content: "First response" }),
						expect.objectContaining({ role: "user", content: "Second message" }),
					]),
				}),
				expect.any(Object), // Headers object
			)
		})
	})

	describe("completePrompt", () => {
		beforeEach(() => {
			handler = new RooHandler(mockOptions)
		})

		it("should complete prompt successfully", async () => {
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockCreate).toHaveBeenCalledWith({
				model: mockOptions.apiModelId,
				messages: [{ role: "user", content: "Test prompt" }],
			})
		})

		it("should handle API errors", async () => {
			mockCreate.mockRejectedValueOnce(new Error("API Error"))
			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"Roo Code Cloud completion error: API Error",
			)
		})

		it("should handle empty response", async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: { content: "" } }],
			})
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})

		it("should handle missing response content", async () => {
			mockCreate.mockResolvedValueOnce({
				choices: [{ message: {} }],
			})
			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		beforeEach(() => {
			handler = new RooHandler(mockOptions)
		})

		it("should return model info for specified model", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(mockOptions.apiModelId)
			expect(modelInfo.info).toBeDefined()
			// roo/sonic is a valid model in rooModels
			expect(modelInfo.info).toBe(rooModels["roo/sonic"])
		})

		it("should return default model when no model specified", () => {
			const handlerWithoutModel = new RooHandler({})
			const modelInfo = handlerWithoutModel.getModel()
			expect(modelInfo.id).toBe(rooDefaultModelId)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info).toBe(rooModels[rooDefaultModelId])
		})

		it("should handle unknown model ID with fallback info", () => {
			const handlerWithUnknownModel = new RooHandler({
				apiModelId: "unknown-model-id",
			})
			const modelInfo = handlerWithUnknownModel.getModel()
			expect(modelInfo.id).toBe("unknown-model-id")
			expect(modelInfo.info).toBeDefined()
			// Should return fallback info for unknown models
			expect(modelInfo.info.maxTokens).toBe(16_384)
			expect(modelInfo.info.contextWindow).toBe(262_144)
			expect(modelInfo.info.supportsImages).toBe(false)
			expect(modelInfo.info.supportsPromptCache).toBe(false) // Should be false now to prevent context mixing
			expect(modelInfo.info.inputPrice).toBe(0)
			expect(modelInfo.info.outputPrice).toBe(0)
		})

		it("should return correct model info for all Roo models", () => {
			// Test each model in rooModels
			const modelIds = Object.keys(rooModels) as Array<keyof typeof rooModels>

			for (const modelId of modelIds) {
				const handlerWithModel = new RooHandler({ apiModelId: modelId })
				const modelInfo = handlerWithModel.getModel()
				expect(modelInfo.id).toBe(modelId)
				expect(modelInfo.info).toBe(rooModels[modelId])
			}
		})
	})

	describe("temperature and model configuration", () => {
		it("should omit temperature when not explicitly set", async () => {
			handler = new RooHandler(mockOptions)
			const stream = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.not.objectContaining({
					temperature: expect.anything(),
				}),
				expect.any(Object), // Headers object
			)
		})

		it("should respect custom temperature setting", async () => {
			handler = new RooHandler({
				...mockOptions,
				modelTemperature: 0.9,
			})
			const stream = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream) {
				// Consume stream
			}

			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					temperature: 0.9,
				}),
				expect.any(Object), // Headers object
			)
		})

		it("should use correct API endpoint", () => {
			// The base URL should be set to Roo's API endpoint
			// We can't directly test the OpenAI client configuration, but we can verify the handler initializes
			handler = new RooHandler(mockOptions)
			expect(handler).toBeInstanceOf(RooHandler)
			// The handler should work with the Roo API endpoint
		})
	})

	describe("authentication flow", () => {
		it("should use session token as API key", () => {
			const testToken = "test-session-token-123"
			mockGetSessionTokenFn.mockReturnValue(testToken)

			handler = new RooHandler(mockOptions)
			expect(handler).toBeInstanceOf(RooHandler)
			expect(mockGetSessionTokenFn).toHaveBeenCalled()
		})

		it("should handle undefined auth service", () => {
			mockHasInstanceFn.mockReturnValue(true)
			// Mock CloudService with undefined authService
			const originalGetter = Object.getOwnPropertyDescriptor(CloudService, "instance")?.get

			try {
				Object.defineProperty(CloudService, "instance", {
					get: () => ({ authService: undefined }),
					configurable: true,
				})

				expect(() => {
					new RooHandler(mockOptions)
				}).toThrow("Authentication required for Roo Code Cloud")
			} finally {
				// Always restore original getter, even if test fails
				if (originalGetter) {
					Object.defineProperty(CloudService, "instance", {
						get: originalGetter,
						configurable: true,
					})
				}
			}
		})

		it("should handle empty session token", () => {
			mockGetSessionTokenFn.mockReturnValue("")

			expect(() => {
				new RooHandler(mockOptions)
			}).toThrow("Authentication required for Roo Code Cloud")
		})
	})

	describe("session isolation", () => {
		beforeEach(() => {
			mockHasInstanceFn.mockReturnValue(true)
			mockGetSessionTokenFn.mockReturnValue("test-session-token")
			mockCreate.mockClear()
		})

		it("should include session isolation headers in requests", async () => {
			handler = new RooHandler(mockOptions)
			const stream = handler.createMessage(systemPrompt, messages)

			// Consume the stream
			for await (const _chunk of stream) {
				// Just consume
			}

			// Verify that create was called with session isolation headers
			expect(mockCreate).toHaveBeenCalledWith(
				expect.any(Object),
				expect.objectContaining({
					headers: expect.objectContaining({
						"X-Session-Id": expect.any(String),
						"X-Request-Id": expect.any(String),
						"X-No-Cache": "true",
						"Cache-Control": "no-store, no-cache, must-revalidate",
						Pragma: "no-cache",
					}),
				}),
			)
		})

		it("should generate unique session IDs for different handler instances", async () => {
			const handler1 = new RooHandler(mockOptions)
			const handler2 = new RooHandler(mockOptions)

			// Create messages with both handlers
			const stream1 = handler1.createMessage(systemPrompt, messages)
			for await (const _chunk of stream1) {
				// Consume
			}

			const stream2 = handler2.createMessage(systemPrompt, messages)
			for await (const _chunk of stream2) {
				// Consume
			}

			// Get the session IDs from the calls
			const call1Headers = mockCreate.mock.calls[0][1].headers
			const call2Headers = mockCreate.mock.calls[1][1].headers

			// Session IDs should be different for different handler instances
			expect(call1Headers["X-Session-Id"]).toBeDefined()
			expect(call2Headers["X-Session-Id"]).toBeDefined()
			expect(call1Headers["X-Session-Id"]).not.toBe(call2Headers["X-Session-Id"])
		})

		it("should generate unique request IDs for each request", async () => {
			handler = new RooHandler(mockOptions)

			// Make two requests with the same handler
			const stream1 = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream1) {
				// Consume
			}

			const stream2 = handler.createMessage(systemPrompt, messages)
			for await (const _chunk of stream2) {
				// Consume
			}

			// Get the request IDs from the calls
			const call1Headers = mockCreate.mock.calls[0][1].headers
			const call2Headers = mockCreate.mock.calls[1][1].headers

			// Request IDs should be different for each request
			expect(call1Headers["X-Request-Id"]).toBeDefined()
			expect(call2Headers["X-Request-Id"]).toBeDefined()
			expect(call1Headers["X-Request-Id"]).not.toBe(call2Headers["X-Request-Id"])

			// But session IDs should be the same for the same handler
			expect(call1Headers["X-Session-Id"]).toBe(call2Headers["X-Session-Id"])
		})

		it("should include metadata in request params", async () => {
			handler = new RooHandler(mockOptions)
			const stream = handler.createMessage(systemPrompt, messages)

			for await (const _chunk of stream) {
				// Consume
			}

			// Verify metadata is included in the request
			expect(mockCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					metadata: expect.objectContaining({
						session_id: expect.any(String),
						request_id: expect.any(String),
						timestamp: expect.any(String),
					}),
				}),
				expect.any(Object),
			)
		})

		it("should have prompt caching disabled for roo/sonic model", () => {
			handler = new RooHandler(mockOptions)
			const modelInfo = handler.getModel()

			// Verify that prompt caching is disabled
			expect(modelInfo.info.supportsPromptCache).toBe(false)
		})

		it("should maintain session ID consistency across multiple requests", async () => {
			handler = new RooHandler(mockOptions)

			// Make multiple requests
			const requests = []
			for (let i = 0; i < 3; i++) {
				const stream = handler.createMessage(systemPrompt, messages)
				for await (const _chunk of stream) {
					// Consume
				}
				requests.push(i)
			}

			// All requests should have the same session ID
			const sessionIds = mockCreate.mock.calls.map((call) => call[1].headers["X-Session-Id"])
			const firstSessionId = sessionIds[0]

			expect(sessionIds.every((id) => id === firstSessionId)).toBe(true)

			// But all request IDs should be unique
			const requestIds = mockCreate.mock.calls.map((call) => call[1].headers["X-Request-Id"])
			const uniqueRequestIds = new Set(requestIds)

			expect(uniqueRequestIds.size).toBe(requestIds.length)
		})
	})
})
