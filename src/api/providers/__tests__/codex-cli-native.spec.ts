// npx vitest run api/providers/__tests__/codex-cli-native.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import { OpenAiNativeHandler } from "../openai-native"
import { buildApiHandler } from "../../index"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock OpenAI client
const mockResponsesCreate = vitest.fn()

vitest.mock("openai", () => {
	return {
		__esModule: true,
		default: vitest.fn().mockImplementation(() => ({
			responses: {
				create: mockResponsesCreate,
			},
		})),
	}
})

describe("Codex CLI Native Provider", () => {
	let handler: OpenAiNativeHandler
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
			apiProvider: "codex-cli-native",
			apiModelId: "gpt-4o",
			codexCliOpenAiNativeToken: "test-bearer-token",
		} as any
		mockResponsesCreate.mockClear()
		// Clear fetch mock if it exists
		if ((global as any).fetch) {
			delete (global as any).fetch
		}
	})

	afterEach(() => {
		// Clean up fetch mock
		if ((global as any).fetch) {
			delete (global as any).fetch
		}
	})

	describe("Factory Integration", () => {
		it("should create OpenAiNativeHandler when codex-cli-native is selected", () => {
			const handler = buildApiHandler(mockOptions as any)
			expect(handler).toBeInstanceOf(OpenAiNativeHandler)
		})

		it("should pass the token from codexCliOpenAiNativeToken to openAiNativeApiKey", async () => {
			// Mock fetch for testing
			const mockFetch = vitest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":"Test"}\n\n'),
						)
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
						controller.close()
					},
				}),
			})
			global.fetch = mockFetch as any

			// Mock SDK to fail so it uses fetch
			mockResponsesCreate.mockRejectedValue(new Error("SDK not available"))

			const handler = buildApiHandler(mockOptions as any)
			const stream = handler.createMessage(systemPrompt, messages)

			// Consume the stream to trigger the fetch call
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify the Authorization header uses the token from codexCliOpenAiNativeToken
			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					headers: expect.objectContaining({
						Authorization: "Bearer test-bearer-token",
					}),
				}),
			)
		})

		it("should use default OpenAI base URL if not specified", async () => {
			// Mock fetch for testing
			const mockFetch = vitest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":"Test"}\n\n'),
						)
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
						controller.close()
					},
				}),
			})
			global.fetch = mockFetch as any

			// Mock SDK to fail so it uses fetch
			mockResponsesCreate.mockRejectedValue(new Error("SDK not available"))

			const handler = buildApiHandler(mockOptions as any)
			const stream = handler.createMessage(systemPrompt, messages)

			// Consume the stream to trigger the fetch call
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify it uses the default OpenAI API endpoint (Responses API for gpt-4o)
			expect(mockFetch).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.any(Object))
		})

		it("should use custom base URL if provided", async () => {
			// Mock fetch for testing
			const mockFetch = vitest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":"Test"}\n\n'),
						)
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
						controller.close()
					},
				}),
			})
			global.fetch = mockFetch as any

			// Mock SDK to fail so it uses fetch
			mockResponsesCreate.mockRejectedValue(new Error("SDK not available"))

			const optionsWithCustomUrl = {
				...mockOptions,
				openAiNativeBaseUrl: "https://custom.api.com",
			}

			const handler = buildApiHandler(optionsWithCustomUrl as any)
			const stream = handler.createMessage(systemPrompt, messages)

			// Consume the stream to trigger the fetch call
			for await (const chunk of stream) {
				// Just consume the stream
			}

			// Verify it uses the custom base URL (Responses API for gpt-4o)
			expect(mockFetch).toHaveBeenCalledWith("https://custom.api.com/v1/responses", expect.any(Object))
		})
	})

	describe("Streaming", () => {
		it("should handle streaming responses via Responses API", async () => {
			// Mock fetch for Responses API fallback
			const mockFetch = vitest.fn().mockResolvedValue({
				ok: true,
				body: new ReadableStream({
					start(controller) {
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":"Hello"}\n\n'),
						)
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":" from"}\n\n'),
						)
						controller.enqueue(
							new TextEncoder().encode('data: {"type":"response.text.delta","delta":" Codex"}\n\n'),
						)
						controller.enqueue(
							new TextEncoder().encode(
								'data: {"type":"response.done","response":{"usage":{"prompt_tokens":10,"completion_tokens":3}}}\n\n',
							),
						)
						controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"))
						controller.close()
					},
				}),
			})
			global.fetch = mockFetch as any

			// Mock SDK to fail so it falls back to fetch
			mockResponsesCreate.mockRejectedValue(new Error("SDK not available"))

			const handler = buildApiHandler(mockOptions as any)
			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(3)
			expect(textChunks[0].text).toBe("Hello")
			expect(textChunks[1].text).toBe(" from")
			expect(textChunks[2].text).toBe(" Codex")
		})

		it("should handle API errors", async () => {
			// Mock fetch to return error
			const mockFetch = vitest.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "Unauthorized",
			})
			global.fetch = mockFetch as any

			// Mock SDK to fail
			mockResponsesCreate.mockRejectedValue(new Error("SDK not available"))

			const handler = buildApiHandler(mockOptions as any)
			const stream = handler.createMessage(systemPrompt, messages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Authentication failed")
		})
	})

	describe("Non-streaming completion", () => {
		it("should handle non-streaming completion using Responses API", async () => {
			// Mock the responses.create method to return a non-streaming response
			mockResponsesCreate.mockResolvedValue({
				output: [
					{
						type: "message",
						content: [
							{
								type: "output_text",
								text: "This is the completion response from Codex CLI",
							},
						],
					},
				],
			})

			const handler = buildApiHandler(mockOptions as any) as OpenAiNativeHandler
			const result = await handler.completePrompt("Test prompt")

			expect(result).toBe("This is the completion response from Codex CLI")
			expect(mockResponsesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "gpt-4o",
					stream: false,
					store: false,
					input: [
						{
							role: "user",
							content: [{ type: "input_text", text: "Test prompt" }],
						},
					],
				}),
			)
		})
	})

	describe("Model selection", () => {
		it("should support all OpenAI native models", () => {
			const models = ["gpt-4o", "gpt-4o-mini", "gpt-5-2025-08-07", "gpt-5-mini-2025-08-07"]

			models.forEach((modelId) => {
				const options = {
					...mockOptions,
					apiModelId: modelId,
				}
				const handler = buildApiHandler(options as any)
				const modelInfo = handler.getModel()
				expect(modelInfo.id).toBe(modelId)
				expect(modelInfo.info).toBeDefined()
			})
		})
	})

	describe("Token validation", () => {
		it("should work with empty token (for initial setup)", () => {
			const optionsWithoutToken = {
				...mockOptions,
				codexCliOpenAiNativeToken: "",
			}
			const handler = buildApiHandler(optionsWithoutToken as any)
			expect(handler).toBeInstanceOf(OpenAiNativeHandler)
		})

		it("should work with undefined token (before sign-in)", () => {
			const optionsWithoutToken = {
				apiProvider: "codex-cli-native" as const,
				apiModelId: "gpt-4o",
				// codexCliOpenAiNativeToken is not provided
			} as any
			const handler = buildApiHandler(optionsWithoutToken)
			expect(handler).toBeInstanceOf(OpenAiNativeHandler)
		})
	})
})
