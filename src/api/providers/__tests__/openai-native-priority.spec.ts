import { describe, it, expect, vi, beforeEach } from "vitest"
import OpenAI from "openai"
import { OpenAiNativeHandler } from "../openai-native"
import type { ApiHandlerOptions } from "../../../shared/api"
import type { Anthropic } from "@anthropic-ai/sdk"

vi.mock("openai")

describe("OpenAI Native Priority Processing", () => {
	let handler: OpenAiNativeHandler
	let mockCreate: ReturnType<typeof vi.fn>
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockCreate = vi.fn()
		;(OpenAI as any).mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
			responses: {
				create: vi.fn(),
			},
		}))

		mockOptions = {
			openAiNativeApiKey: "test-api-key",
			apiModelId: "gpt-5-2025-08-07",
		}
	})

	describe("Priority Processing for GPT-5 models", () => {
		it("should use priority endpoint when priority processing is enabled", () => {
			const handlerWithPriority = new OpenAiNativeHandler({
				...mockOptions,
				enablePriorityProcessing: true,
			})

			// Check that the OpenAI client was initialized with the priority endpoint
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: "https://api.openai.com/v1/priority",
				apiKey: "test-api-key",
			})
		})

		it("should use standard endpoint when priority processing is disabled", () => {
			const handlerWithoutPriority = new OpenAiNativeHandler({
				...mockOptions,
				enablePriorityProcessing: false,
			})

			// Check that the OpenAI client was initialized with the standard endpoint
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: undefined,
				apiKey: "test-api-key",
			})
		})

		it("should respect custom base URL even with priority processing enabled", () => {
			const customBaseUrl = "https://custom.api.com/v1"
			const handlerWithCustomUrl = new OpenAiNativeHandler({
				...mockOptions,
				openAiNativeBaseUrl: customBaseUrl,
				enablePriorityProcessing: true,
			})

			// Check that the custom URL is preserved
			expect(OpenAI).toHaveBeenCalledWith({
				baseURL: customBaseUrl,
				apiKey: "test-api-key",
			})
		})

		it("should include priority in GPT-5 request body when enabled", async () => {
			const handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "gpt-5-2025-08-07",
				enablePriorityProcessing: true,
			})

			// Mock the responses.create method
			const mockResponsesCreate = vi.fn().mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { type: "response.done", response: { id: "test-id" } }
				},
			})
			;(handler as any).client.responses = { create: mockResponsesCreate }

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			for await (const chunk of stream) {
				// Process stream
			}

			// Check that the request included the priority flag
			expect(mockResponsesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					priority: true,
				}),
			)
		})

		it("should not include priority in GPT-5 request body when disabled", async () => {
			const handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "gpt-5-2025-08-07",
				enablePriorityProcessing: false,
			})

			// Mock the responses.create method
			const mockResponsesCreate = vi.fn().mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { type: "response.done", response: { id: "test-id" } }
				},
			})
			;(handler as any).client.responses = { create: mockResponsesCreate }

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			for await (const chunk of stream) {
				// Process stream
			}

			// Check that the request did not include the priority flag
			expect(mockResponsesCreate).toHaveBeenCalledWith(
				expect.not.objectContaining({
					priority: true,
				}),
			)
		})

		it("should work with GPT-5-mini models", async () => {
			const handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "gpt-5-mini-2025-08-07",
				enablePriorityProcessing: true,
			})

			// Mock the responses.create method
			const mockResponsesCreate = vi.fn().mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield { type: "response.done", response: { id: "test-id" } }
				},
			})
			;(handler as any).client.responses = { create: mockResponsesCreate }

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			for await (const chunk of stream) {
				// Process stream
			}

			// Check that the request included the priority flag for GPT-5-mini
			expect(mockResponsesCreate).toHaveBeenCalledWith(
				expect.objectContaining({
					priority: true,
				}),
			)
		})
	})

	describe("Priority Processing for non-GPT-5 models", () => {
		it("should not affect GPT-4 models", async () => {
			const handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "gpt-4o",
				enablePriorityProcessing: true,
			})

			// Mock streaming response
			mockCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [{ delta: { content: "Hello" } }],
					}
				},
			})

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			for await (const chunk of stream) {
				// Process stream
			}

			// For GPT-4, it should still use the regular chat completions API
			expect(mockCreate).toHaveBeenCalled()
		})

		it("should not affect o1 models", async () => {
			const handler = new OpenAiNativeHandler({
				...mockOptions,
				apiModelId: "o1",
				enablePriorityProcessing: true,
			})

			// Mock streaming response
			mockCreate.mockResolvedValue({
				[Symbol.asyncIterator]: async function* () {
					yield {
						choices: [{ delta: { content: "Hello" } }],
					}
				},
			})

			const systemPrompt = "You are a helpful assistant"
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: "Hello" }]

			const stream = handler.createMessage(systemPrompt, messages)
			for await (const chunk of stream) {
				// Process stream
			}

			// For o1 models, it should use the regular chat completions API
			expect(mockCreate).toHaveBeenCalled()
		})
	})
})
