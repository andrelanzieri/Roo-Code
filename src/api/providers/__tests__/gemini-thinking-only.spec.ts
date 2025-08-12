// npx vitest run src/api/providers/__tests__/gemini-thinking-only.spec.ts

import { describe, it, expect, vi, beforeEach } from "vitest"
import { GeminiHandler } from "../gemini"
import type { ApiHandlerOptions } from "../../../shared/api"

describe("GeminiHandler - Thinking-only responses", () => {
	let handler: GeminiHandler
	let mockClient: any

	beforeEach(() => {
		// Create a mock client
		mockClient = {
			models: {
				generateContentStream: vi.fn(),
			},
		}

		// Create handler with mocked client
		handler = new GeminiHandler({
			apiProvider: "gemini",
			geminiApiKey: "test-key",
			apiModelId: "gemini-2.5-pro",
		} as ApiHandlerOptions)

		// Replace the client with our mock
		;(handler as any).client = mockClient
	})

	it("should yield empty text when only reasoning content is provided", async () => {
		// Mock a stream that only contains reasoning/thinking content
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				// First chunk with only thinking content
				yield {
					candidates: [
						{
							content: {
								parts: [
									{
										thought: true,
										text: "Let me think about this problem...",
									},
								],
							},
						},
					],
				}

				// Second chunk with more thinking
				yield {
					candidates: [
						{
							content: {
								parts: [
									{
										thought: true,
										text: "I need to consider the tool usage...",
									},
								],
							},
						},
					],
				}

				// Final chunk with usage metadata but no actual content
				yield {
					usageMetadata: {
						promptTokenCount: 100,
						candidatesTokenCount: 50,
						thoughtsTokenCount: 30,
					},
				}
			},
		}

		mockClient.models.generateContentStream.mockResolvedValue(mockStream)

		// Collect all chunks from the stream
		const chunks: any[] = []
		const stream = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify we got reasoning chunks
		const reasoningChunks = chunks.filter((c) => c.type === "reasoning")
		expect(reasoningChunks).toHaveLength(2)
		expect(reasoningChunks[0].text).toBe("Let me think about this problem...")
		expect(reasoningChunks[1].text).toBe("I need to consider the tool usage...")

		// Verify we got at least one text chunk (even if empty) to prevent the error
		const textChunks = chunks.filter((c) => c.type === "text")
		expect(textChunks).toHaveLength(1)
		expect(textChunks[0].text).toBe("")

		// Verify we got usage metadata
		const usageChunks = chunks.filter((c) => c.type === "usage")
		expect(usageChunks).toHaveLength(1)
		expect(usageChunks[0].inputTokens).toBe(100)
		expect(usageChunks[0].outputTokens).toBe(50)
	})

	it("should not add empty text when actual content is provided", async () => {
		// Mock a stream that contains both reasoning and actual content
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				// First chunk with thinking
				yield {
					candidates: [
						{
							content: {
								parts: [
									{
										thought: true,
										text: "Thinking about the response...",
									},
								],
							},
						},
					],
				}

				// Second chunk with actual content
				yield {
					candidates: [
						{
							content: {
								parts: [
									{
										text: "Here is my actual response.",
									},
								],
							},
						},
					],
				}

				// Usage metadata
				yield {
					usageMetadata: {
						promptTokenCount: 100,
						candidatesTokenCount: 50,
					},
				}
			},
		}

		mockClient.models.generateContentStream.mockResolvedValue(mockStream)

		// Collect all chunks from the stream
		const chunks: any[] = []
		const stream = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify we got reasoning chunk
		const reasoningChunks = chunks.filter((c) => c.type === "reasoning")
		expect(reasoningChunks).toHaveLength(1)

		// Verify we got actual text content (not empty)
		const textChunks = chunks.filter((c) => c.type === "text")
		expect(textChunks).toHaveLength(1)
		expect(textChunks[0].text).toBe("Here is my actual response.")

		// Should NOT have an additional empty text chunk
		const emptyTextChunks = textChunks.filter((c) => c.text === "")
		expect(emptyTextChunks).toHaveLength(0)
	})

	it("should handle mixed thinking and content in same part", async () => {
		// Mock a stream with mixed content
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield {
					candidates: [
						{
							content: {
								parts: [
									{
										thought: true,
										text: "Analyzing the request...",
									},
									{
										text: "I'll help you with that.",
									},
									{
										thought: true,
										text: "Considering tool usage...",
									},
								],
							},
						},
					],
				}
			},
		}

		mockClient.models.generateContentStream.mockResolvedValue(mockStream)

		// Collect all chunks from the stream
		const chunks: any[] = []
		const stream = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify we got both reasoning and text chunks
		const reasoningChunks = chunks.filter((c) => c.type === "reasoning")
		expect(reasoningChunks).toHaveLength(2)

		const textChunks = chunks.filter((c) => c.type === "text")
		expect(textChunks).toHaveLength(1)
		expect(textChunks[0].text).toBe("I'll help you with that.")
	})

	it("should handle empty stream gracefully", async () => {
		// Mock an empty stream
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				// Yield nothing
			},
		}

		mockClient.models.generateContentStream.mockResolvedValue(mockStream)

		// Collect all chunks from the stream
		const chunks: any[] = []
		const stream = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Should yield at least an empty text chunk to prevent errors
		const textChunks = chunks.filter((c) => c.type === "text")
		expect(textChunks).toHaveLength(1)
		expect(textChunks[0].text).toBe("")
	})
})
