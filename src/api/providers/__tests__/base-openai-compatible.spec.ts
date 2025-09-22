import { describe, it, expect, vi, beforeEach } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { BaseOpenAiCompatibleProvider } from "../base-openai-compatible-provider"
import { type ModelInfo } from "@roo-code/types"

// Create a concrete implementation for testing
class TestOpenAiCompatibleProvider extends BaseOpenAiCompatibleProvider<"test-model"> {
	constructor(options: any) {
		super({
			providerName: "TestProvider",
			baseURL: "https://test.api.com/v1",
			defaultProviderModelId: "test-model",
			providerModels: {
				"test-model": {
					maxTokens: 4096,
					contextWindow: 8192,
					supportsPromptCache: false,
					supportsComputerUse: false,
					supportsStreaming: true,
					inputPrice: 0,
					outputPrice: 0,
				} as ModelInfo,
			},
			...options,
		})
	}
}

describe("BaseOpenAiCompatibleProvider", () => {
	let provider: TestOpenAiCompatibleProvider
	let mockCreate: ReturnType<typeof vi.fn>

	beforeEach(() => {
		mockCreate = vi.fn()
		vi.spyOn(OpenAI.Chat.Completions.prototype, "create").mockImplementation(mockCreate)
	})

	describe("createMessage", () => {
		it("should handle empty response from API gracefully", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: "test-key",
			})

			// Mock an empty stream response (no content in chunks)
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					// Yield chunks with no content
					yield {
						choices: [
							{
								delta: {
									// No content field
								},
							},
						],
					}
					// Yield usage information
					yield {
						choices: [
							{
								delta: {},
							},
						],
						usage: {
							prompt_tokens: 100,
							completion_tokens: 0,
						},
					}
				},
			}

			mockCreate.mockResolvedValue(mockStream)

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello",
				},
			]

			const stream = provider.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have at least one text chunk (even if empty) and one usage chunk
			expect(chunks).toHaveLength(2)

			// Should have a usage chunk
			const usageChunk = chunks.find((c) => c.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 100,
				outputTokens: 0,
			})

			// Should have an empty text chunk (added by our fix)
			const textChunk = chunks.find((c) => c.type === "text")
			expect(textChunk).toEqual({
				type: "text",
				text: "",
			})
		})

		it("should handle normal response with content", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: "test-key",
			})

			// Mock a normal stream response with content
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield {
						choices: [
							{
								delta: {
									content: "Hello, ",
								},
							},
						],
					}
					yield {
						choices: [
							{
								delta: {
									content: "world!",
								},
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
							prompt_tokens: 100,
							completion_tokens: 10,
						},
					}
				},
			}

			mockCreate.mockResolvedValue(mockStream)

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello",
				},
			]

			const stream = provider.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have text chunks and usage chunk
			expect(chunks).toHaveLength(3)

			// First two chunks should be text
			expect(chunks[0]).toEqual({
				type: "text",
				text: "Hello, ",
			})
			expect(chunks[1]).toEqual({
				type: "text",
				text: "world!",
			})

			// Last chunk should be usage information
			expect(chunks[2]).toEqual({
				type: "usage",
				inputTokens: 100,
				outputTokens: 10,
			})
		})

		it("should handle response with only usage and no content", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: "test-key",
			})

			// Mock a stream response with only usage, no content
			const mockStream = {
				async *[Symbol.asyncIterator]() {
					yield {
						choices: [
							{
								delta: {},
							},
						],
						usage: {
							prompt_tokens: 50,
							completion_tokens: 0,
						},
					}
				},
			}

			mockCreate.mockResolvedValue(mockStream)

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Test",
				},
			]

			const stream = provider.createMessage(systemPrompt, messages)
			const chunks = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have empty text chunk and usage chunk
			expect(chunks).toHaveLength(2)

			// Should have a usage chunk
			const usageChunk = chunks.find((c) => c.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 50,
				outputTokens: 0,
			})

			// Should have an empty text chunk (added by our fix)
			const textChunk = chunks.find((c) => c.type === "text")
			expect(textChunk).toEqual({
				type: "text",
				text: "",
			})
		})
	})
})
