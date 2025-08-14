import { describe, it, expect, vi, beforeEach } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import { FallbackApiHandler } from "../FallbackApiHandler"
import * as apiIndex from "../index"
import type { ProviderSettingsWithId, ModelInfo } from "@roo-code/types"
import { ApiStreamChunk, ApiStreamError } from "../transform/stream"

// Mock the buildApiHandler function
vi.mock("../index", async () => {
	const actual = await vi.importActual("../index")
	return {
		...actual,
		buildApiHandler: vi.fn(),
	}
})

describe("FallbackApiHandler", () => {
	let mockHandlers: any[]
	let configurations: ProviderSettingsWithId[]

	beforeEach(() => {
		vi.clearAllMocks()

		// Create mock configurations
		configurations = [
			{ id: "primary", apiProvider: "anthropic" },
			{ id: "secondary", apiProvider: "openai" },
			{ id: "tertiary", apiProvider: "ollama" },
		]

		// Create mock handlers
		mockHandlers = configurations.map((config, index) => ({
			createMessage: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: `model-${index}`,
				info: { contextWindow: 100000 } as ModelInfo,
			}),
			countTokens: vi.fn().mockResolvedValue(100),
		}))

		// Setup the mock to return appropriate handlers
		vi.mocked(apiIndex.buildApiHandler).mockImplementation((config: any) => {
			const index = configurations.findIndex((c) => c.id === config.id)
			return mockHandlers[index] || mockHandlers[0]
		})
	})

	describe("constructor", () => {
		it("should throw error if no configurations provided", () => {
			expect(() => new FallbackApiHandler([])).toThrow("At least one API configuration is required")
		})

		it("should initialize with valid configurations", () => {
			const handler = new FallbackApiHandler(configurations)
			expect(handler).toBeDefined()
			expect(handler.getConfiguredProviders()).toEqual(["anthropic", "openai", "ollama"])
		})
	})

	describe("createMessage", () => {
		it("should use primary handler when it succeeds", async () => {
			const handler = new FallbackApiHandler(configurations)
			const systemPrompt = "Test prompt"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			// Mock successful stream from primary handler
			const mockStream = (async function* () {
				yield { type: "text", text: "Response from primary" } as ApiStreamChunk
				yield { type: "usage", inputTokens: 10, outputTokens: 20 } as ApiStreamChunk
			})()

			mockHandlers[0].createMessage.mockReturnValue(mockStream)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: ApiStreamChunk[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2)
			expect(chunks[0]).toEqual({ type: "text", text: "Response from primary" })
			expect(mockHandlers[0].createMessage).toHaveBeenCalledWith(systemPrompt, messages, undefined)
			expect(mockHandlers[1].createMessage).not.toHaveBeenCalled()
			expect(mockHandlers[2].createMessage).not.toHaveBeenCalled()
		})

		it("should fallback to secondary handler when primary fails", async () => {
			const handler = new FallbackApiHandler(configurations)
			const systemPrompt = "Test prompt"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			// Mock failed stream from primary handler
			// eslint-disable-next-line require-yield
			const mockFailedStream = (async function* () {
				throw new Error("Primary API failed")
			})()

			// Mock successful stream from secondary handler
			const mockSuccessStream = (async function* () {
				yield { type: "text", text: "Response from secondary" } as ApiStreamChunk
			})()

			mockHandlers[0].createMessage.mockReturnValue(mockFailedStream)
			mockHandlers[1].createMessage.mockReturnValue(mockSuccessStream)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: ApiStreamChunk[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(1)
			expect(chunks[0]).toEqual({ type: "text", text: "Response from secondary" })
			expect(mockHandlers[0].createMessage).toHaveBeenCalled()
			expect(mockHandlers[1].createMessage).toHaveBeenCalled()
			expect(mockHandlers[2].createMessage).not.toHaveBeenCalled()
		})

		it("should try all handlers and return error if all fail", async () => {
			const handler = new FallbackApiHandler(configurations)
			const systemPrompt = "Test prompt"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			// Mock all handlers to fail
			mockHandlers.forEach((mockHandler, index) => {
				// eslint-disable-next-line require-yield
				const mockFailedStream = (async function* () {
					throw new Error(`Handler ${index} failed`)
				})()
				mockHandler.createMessage.mockReturnValue(mockFailedStream)
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: ApiStreamChunk[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(1)
			const errorChunk = chunks[0] as ApiStreamError
			expect(errorChunk.type).toBe("error")
			expect(errorChunk.message).toContain("All API providers failed")

			// All handlers should have been tried
			mockHandlers.forEach((mockHandler) => {
				expect(mockHandler.createMessage).toHaveBeenCalled()
			})
		})

		it("should handle partial stream failure and fallback", async () => {
			const handler = new FallbackApiHandler(configurations)
			const systemPrompt = "Test prompt"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			// Mock primary handler to fail after yielding some chunks
			const mockPartialFailStream = (async function* () {
				yield { type: "text", text: "Partial " } as ApiStreamChunk
				throw new Error("Stream interrupted")
			})()

			// Mock secondary handler to succeed
			const mockSuccessStream = (async function* () {
				yield { type: "text", text: "Complete response from secondary" } as ApiStreamChunk
			})()

			mockHandlers[0].createMessage.mockReturnValue(mockPartialFailStream)
			mockHandlers[1].createMessage.mockReturnValue(mockSuccessStream)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: ApiStreamChunk[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should get partial response from primary, then complete response from secondary
			expect(chunks).toHaveLength(2)
			expect(chunks[0]).toEqual({ type: "text", text: "Partial " })
			expect(chunks[1]).toEqual({ type: "text", text: "Complete response from secondary" })
		})
	})

	describe("getModel", () => {
		it("should return model from last successful handler", async () => {
			const handler = new FallbackApiHandler(configurations)

			// Initially should return from first handler
			let model = handler.getModel()
			expect(model.id).toBe("model-0")

			// Simulate a successful call with the second handler
			const mockStream = (async function* () {
				yield { type: "text", text: "Response" } as ApiStreamChunk
			})()

			mockHandlers[0].createMessage.mockReturnValue(
				// eslint-disable-next-line require-yield
				(async function* () {
					throw new Error("Failed")
				})(),
			)
			mockHandlers[1].createMessage.mockReturnValue(mockStream)

			const stream = handler.createMessage("prompt", [])
			for await (const _ of stream) {
				// Consume stream
			}

			// Now should return from second handler
			model = handler.getModel()
			expect(model.id).toBe("model-1")
		})
	})

	describe("countTokens", () => {
		it("should use last successful handler for token counting", async () => {
			const handler = new FallbackApiHandler(configurations)
			const content: Anthropic.Messages.ContentBlockParam[] = [{ type: "text", text: "Test content" }]

			mockHandlers[0].countTokens.mockResolvedValue(150)

			const count = await handler.countTokens(content)
			expect(count).toBe(150)
			expect(mockHandlers[0].countTokens).toHaveBeenCalledWith(content)
		})
	})

	describe("reset", () => {
		it("should reset to use primary handler", async () => {
			const handler = new FallbackApiHandler(configurations)

			// Simulate using secondary handler
			const mockStream = (async function* () {
				yield { type: "text", text: "Response" } as ApiStreamChunk
			})()

			mockHandlers[0].createMessage.mockReturnValue(
				// eslint-disable-next-line require-yield
				(async function* () {
					throw new Error("Failed")
				})(),
			)
			mockHandlers[1].createMessage.mockReturnValue(mockStream)

			const stream = handler.createMessage("prompt", [])
			for await (const _ of stream) {
				// Consume stream
			}

			expect(handler.getCurrentProvider()).toBe("openai")

			// Reset
			handler.reset()

			// Should be back to primary
			expect(handler.getCurrentProvider()).toBe("anthropic")
		})
	})
})
