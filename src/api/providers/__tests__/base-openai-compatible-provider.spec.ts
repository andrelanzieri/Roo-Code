// npx vitest run src/api/providers/__tests__/base-openai-compatible-provider.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import OpenAI from "openai"
import { Anthropic } from "@anthropic-ai/sdk"
import { BaseOpenAiCompatibleProvider } from "../base-openai-compatible-provider"
import type { ModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../../shared/api"

// Mock OpenAI
const mockCreate = vi.fn()
vi.mock("openai", () => {
	return {
		default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
	}
})

// Create a concrete test implementation of the abstract class
class TestProvider extends BaseOpenAiCompatibleProvider<"test-model"> {
	constructor(options: ApiHandlerOptions) {
		super({
			providerName: "TestProvider",
			baseURL: "https://test.api.com/v1",
			defaultProviderModelId: "test-model",
			providerModels: {
				"test-model": {
					contextWindow: 128000,
					maxTokens: 4096,
					supportsImages: true,
					supportsPromptCache: false,
				} as ModelInfo,
			},
			apiKey: options.apiKey || "test-key",
			...options,
		})
	}
}

describe("BaseOpenAiCompatibleProvider", () => {
	let provider: TestProvider

	beforeEach(() => {
		vi.clearAllMocks()
		provider = new TestProvider({ apiKey: "test-api-key" })
	})

	describe("reasoning chunk handling", () => {
		it("should yield reasoning chunks when delta contains reasoning_content field", async () => {
			const reasoningText = "Let me think about this step by step..."

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Here is my response",
												reasoning_content: reasoningText,
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have both text and reasoning chunks
			expect(chunks).toHaveLength(2)

			const textChunk = chunks.find((c) => c.type === "text")
			expect(textChunk).toEqual({
				type: "text",
				text: "Here is my response",
			})

			const reasoningChunk = chunks.find((c) => c.type === "reasoning")
			expect(reasoningChunk).toEqual({
				type: "reasoning",
				text: reasoningText,
			})
		})

		it("should yield reasoning chunks when delta contains reasoning field", async () => {
			const reasoningText = "Analyzing the problem..."

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "The answer is 42",
												reasoning: reasoningText,
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should have both text and reasoning chunks
			expect(chunks).toHaveLength(2)

			const textChunk = chunks.find((c) => c.type === "text")
			expect(textChunk).toEqual({
				type: "text",
				text: "The answer is 42",
			})

			const reasoningChunk = chunks.find((c) => c.type === "reasoning")
			expect(reasoningChunk).toEqual({
				type: "reasoning",
				text: reasoningText,
			})
		})

		it("should prefer reasoning_content over reasoning when both are present", async () => {
			const reasoningContentText = "This should be used"
			const reasoningText = "This should not be used"

			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Response text",
												reasoning_content: reasoningContentText,
												reasoning: reasoningText,
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			const reasoningChunk = chunks.find((c) => c.type === "reasoning")
			expect(reasoningChunk).toEqual({
				type: "reasoning",
				text: reasoningContentText,
			})
		})

		it("should not yield reasoning chunk for empty reasoning content", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Response",
												reasoning: "",
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should only have text chunk, no reasoning chunk for empty string
			expect(chunks).toHaveLength(1)
			expect(chunks[0].type).toBe("text")

			const reasoningChunk = chunks.find((c) => c.type === "reasoning")
			expect(reasoningChunk).toBeUndefined()
		})

		it("should handle null or undefined reasoning fields", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Response",
												reasoning: null,
												reasoning_content: undefined,
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Should only have text chunk, no reasoning chunk
			expect(chunks).toHaveLength(1)
			expect(chunks[0].type).toBe("text")
		})

		it("should handle multiple reasoning chunks in stream", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												reasoning_content: "First reasoning part...",
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Some text",
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												reasoning: "Second reasoning part...",
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(3)

			const reasoningChunks = chunks.filter((c) => c.type === "reasoning")
			expect(reasoningChunks).toHaveLength(2)
			expect(reasoningChunks[0].text).toBe("First reasoning part...")
			expect(reasoningChunks[1].text).toBe("Second reasoning part...")

			const textChunks = chunks.filter((c) => c.type === "text")
			expect(textChunks).toHaveLength(1)
			expect(textChunks[0].text).toBe("Some text")
		})

		it("should handle reasoning chunks with usage data", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												reasoning_content: "Reasoning...",
											},
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 20,
									},
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2)

			const reasoningChunk = chunks.find((c) => c.type === "reasoning")
			expect(reasoningChunk).toBeDefined()

			const usageChunk = chunks.find((c) => c.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 10,
				outputTokens: 20,
			})
		})
	})

	describe("backward compatibility", () => {
		it("should work normally when no reasoning fields are present", async () => {
			mockCreate.mockImplementationOnce(() => {
				return {
					[Symbol.asyncIterator]: () => ({
						next: vi
							.fn()
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {
												content: "Regular response without reasoning",
											},
										},
									],
								},
							})
							.mockResolvedValueOnce({
								done: false,
								value: {
									choices: [
										{
											delta: {},
										},
									],
									usage: {
										prompt_tokens: 15,
										completion_tokens: 25,
									},
								},
							})
							.mockResolvedValueOnce({ done: true }),
					}),
				}
			})

			const stream = provider.createMessage("system prompt", [])
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks).toHaveLength(2)

			const textChunk = chunks.find((c) => c.type === "text")
			expect(textChunk).toEqual({
				type: "text",
				text: "Regular response without reasoning",
			})

			const usageChunk = chunks.find((c) => c.type === "usage")
			expect(usageChunk).toEqual({
				type: "usage",
				inputTokens: 15,
				outputTokens: 25,
			})

			// No reasoning chunks
			const reasoningChunks = chunks.filter((c) => c.type === "reasoning")
			expect(reasoningChunks).toHaveLength(0)
		})
	})
})
