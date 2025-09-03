// npx vitest core/condense/__tests__/index.spec.ts

import type { Mock } from "vitest"

import { TelemetryService } from "@roo-code/telemetry"

import { ApiHandler } from "../../../api"
import { ApiMessage } from "../../task-persistence/apiMessages"
import { maybeRemoveImageBlocks } from "../../../api/transform/image-cleaning"
import { summarizeConversation, getMessagesSinceLastSummary, N_MESSAGES_TO_KEEP } from "../index"

vi.mock("../../../api/transform/image-cleaning", () => ({
	maybeRemoveImageBlocks: vi.fn((messages: ApiMessage[], _apiHandler: ApiHandler) => [...messages]),
}))

vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureContextCondensed: vi.fn(),
		},
	},
}))

const taskId = "test-task-id"
const DEFAULT_PREV_CONTEXT_TOKENS = 1000

describe("getMessagesSinceLastSummary", () => {
	it("should return all messages when there is no summary", () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
		]

		const result = getMessagesSinceLastSummary(messages)
		expect(result).toEqual(messages)
	})

	it("should return messages since the last summary with prepended user message", () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "assistant", content: "Summary of conversation", ts: 3, isSummary: true },
			{ role: "user", content: "How are you?", ts: 4 },
			{ role: "assistant", content: "I'm good", ts: 5 },
		]

		const result = getMessagesSinceLastSummary(messages)
		expect(result).toEqual([
			{ role: "user", content: "Please continue from the following summary:", ts: 0 },
			{ role: "assistant", content: "Summary of conversation", ts: 3, isSummary: true },
			{ role: "user", content: "How are you?", ts: 4 },
			{ role: "assistant", content: "I'm good", ts: 5 },
		])
	})

	it("should handle multiple summary messages and return since the last one with prepended user message", () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "First summary", ts: 2, isSummary: true },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "Second summary", ts: 4, isSummary: true },
			{ role: "user", content: "What's new?", ts: 5 },
		]

		const result = getMessagesSinceLastSummary(messages)
		expect(result).toEqual([
			{ role: "user", content: "Please continue from the following summary:", ts: 0 },
			{ role: "assistant", content: "Second summary", ts: 4, isSummary: true },
			{ role: "user", content: "What's new?", ts: 5 },
		])
	})

	it("should handle empty messages array", () => {
		const result = getMessagesSinceLastSummary([])
		expect(result).toEqual([])
	})
})

describe("summarizeConversation", () => {
	// Mock ApiHandler
	let mockApiHandler: ApiHandler
	let mockStream: AsyncGenerator<any, void, unknown>

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()

		// Setup mock stream with usage information
		mockStream = (async function* () {
			yield { type: "text" as const, text: "This is " }
			yield { type: "text" as const, text: "a summary" }
			yield { type: "usage" as const, totalCost: 0.05, outputTokens: 150 }
		})()

		// Setup mock API handler
		mockApiHandler = {
			createMessage: vi.fn().mockReturnValue(mockStream),
			countTokens: vi.fn().mockImplementation(() => Promise.resolve(100)),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					contextWindow: 8000,
					supportsImages: true,
					supportsComputerUse: true,
					supportsVision: true,
					maxTokens: 4000,
					supportsPromptCache: true,
					maxCachePoints: 10,
					minTokensPerCachePoint: 100,
					cachableFields: ["system", "messages"],
				},
			}),
		} as unknown as ApiHandler
	})

	// Default system prompt for tests
	const defaultSystemPrompt = "You are a helpful assistant."

	it("should not summarize when there are not enough messages", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
		]

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0)
		expect(result.summary).toBe("")
		expect(result.newContextTokens).toBeUndefined()
		expect(result.error).toBeTruthy() // Error should be set for not enough messages
		expect(mockApiHandler.createMessage).not.toHaveBeenCalled()
	})

	it("should not summarize when there was a recent summary", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6, isSummary: true }, // Recent summary
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0)
		expect(result.summary).toBe("")
		expect(result.newContextTokens).toBeUndefined()
		expect(result.error).toBeTruthy() // Error should be set for recent summary
		expect(mockApiHandler.createMessage).not.toHaveBeenCalled()
	})

	it("should summarize conversation and insert summary message", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)

		// Check that the API was called correctly
		expect(mockApiHandler.createMessage).toHaveBeenCalled()
		expect(maybeRemoveImageBlocks).toHaveBeenCalled()

		// Verify the structure of the result
		// The result should be: original messages (except last N) + summary + last N messages
		expect(result.messages.length).toBe(messages.length + 1) // Original + summary

		// Check that the summary message was inserted correctly
		const summaryMessage = result.messages[result.messages.length - N_MESSAGES_TO_KEEP - 1]
		expect(summaryMessage.role).toBe("assistant")
		expect(summaryMessage.content).toBe("This is a summary")
		expect(summaryMessage.isSummary).toBe(true)

		// Check that the last N_MESSAGES_TO_KEEP messages are preserved
		const lastMessages = messages.slice(-N_MESSAGES_TO_KEEP)
		expect(result.messages.slice(-N_MESSAGES_TO_KEEP)).toEqual(lastMessages)

		// Check the cost and token counts
		expect(result.cost).toBe(0.05)
		expect(result.summary).toBe("This is a summary")
		expect(result.newContextTokens).toBe(250) // 150 output tokens + 100 from countTokens
		expect(result.error).toBeUndefined()
	})

	it("should handle empty summary response and return error", async () => {
		// We need enough messages to trigger summarization
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		// Setup empty summary response with usage information
		const emptyStream = (async function* () {
			yield { type: "text" as const, text: "" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 0 }
		})()

		// Create a new mock for createMessage that returns empty stream
		const createMessageMock = vi.fn().mockReturnValue(emptyStream)
		mockApiHandler.createMessage = createMessageMock as any

		// We need to mock maybeRemoveImageBlocks to return the expected messages
		;(maybeRemoveImageBlocks as Mock).mockImplementationOnce((messages: any) => {
			return messages.map(({ role, content }: { role: string; content: any }) => ({ role, content }))
		})

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)

		// Should return original messages when summary is empty
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0.02)
		expect(result.summary).toBe("")
		expect(result.error).toBeTruthy() // Error should be set
		expect(result.newContextTokens).toBeUndefined()
	})

	it("should correctly format the request to the API", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		await summarizeConversation(messages, mockApiHandler, defaultSystemPrompt, taskId, DEFAULT_PREV_CONTEXT_TOKENS)

		// Verify the final request message
		const expectedFinalMessage = {
			role: "user",
			content: "Summarize the conversation so far, as described in the prompt instructions.",
		}

		// Verify that createMessage was called with the correct prompt
		expect(mockApiHandler.createMessage).toHaveBeenCalledWith(
			expect.stringContaining("Your task is to create a detailed summary of the conversation"),
			expect.any(Array),
		)

		// Check that maybeRemoveImageBlocks was called with the correct messages
		const mockCallArgs = (maybeRemoveImageBlocks as Mock).mock.calls[0][0] as any[]
		expect(mockCallArgs[mockCallArgs.length - 1]).toEqual(expectedFinalMessage)
	})

	it("should calculate newContextTokens correctly with systemPrompt", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		const systemPrompt = "You are a helpful assistant."

		// Create a stream with usage information
		const streamWithUsage = (async function* () {
			yield { type: "text" as const, text: "This is a summary with system prompt" }
			yield { type: "usage" as const, totalCost: 0.06, outputTokens: 200 }
		})()

		// Override the mock for this test
		mockApiHandler.createMessage = vi.fn().mockReturnValue(streamWithUsage) as any

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			systemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)

		// Verify that countTokens was called with the correct messages including system prompt
		expect(mockApiHandler.countTokens).toHaveBeenCalled()

		// Check the newContextTokens calculation includes system prompt
		expect(result.newContextTokens).toBe(300) // 200 output tokens + 100 from countTokens
		expect(result.cost).toBe(0.06)
		expect(result.summary).toBe("This is a summary with system prompt")
		expect(result.error).toBeUndefined()
	})

	it("should return error when new context tokens >= previous context tokens", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		// Create a stream that produces a summary
		const streamWithLargeTokens = (async function* () {
			yield { type: "text" as const, text: "This is a very long summary that uses many tokens" }
			yield { type: "usage" as const, totalCost: 0.08, outputTokens: 500 }
		})()

		// Override the mock for this test
		mockApiHandler.createMessage = vi.fn().mockReturnValue(streamWithLargeTokens) as any

		// Mock countTokens to return a high value that when added to outputTokens (500)
		// will be >= prevContextTokens (600)
		mockApiHandler.countTokens = vi.fn().mockImplementation(() => Promise.resolve(200)) as any

		const prevContextTokens = 600
		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			prevContextTokens,
		)

		// Should return original messages when context would grow
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0.08)
		expect(result.summary).toBe("")
		expect(result.error).toBeTruthy() // Error should be set
		expect(result.newContextTokens).toBeUndefined()
	})

	it("should successfully summarize when new context tokens < previous context tokens", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		// Create a stream that produces a summary with reasonable token count
		const streamWithSmallTokens = (async function* () {
			yield { type: "text" as const, text: "Concise summary" }
			yield { type: "usage" as const, totalCost: 0.03, outputTokens: 50 }
		})()

		// Override the mock for this test
		mockApiHandler.createMessage = vi.fn().mockReturnValue(streamWithSmallTokens) as any

		// Mock countTokens to return a small value so total is < prevContextTokens
		mockApiHandler.countTokens = vi.fn().mockImplementation(() => Promise.resolve(30)) as any

		const prevContextTokens = 200
		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			prevContextTokens,
		)

		// Should successfully summarize
		expect(result.messages.length).toBe(messages.length + 1) // Original + summary
		expect(result.cost).toBe(0.03)
		expect(result.summary).toBe("Concise summary")
		expect(result.error).toBeUndefined()
		expect(result.newContextTokens).toBe(80) // 50 output tokens + 30 from countTokens
		expect(result.newContextTokens).toBeLessThan(prevContextTokens)
	})

	it("should return error when not enough messages to summarize", async () => {
		const messages: ApiMessage[] = [{ role: "user", content: "Hello", ts: 1 }]

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)

		// Should return original messages when not enough to summarize
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0)
		expect(result.summary).toBe("")
		expect(result.error).toBeTruthy() // Error should be set
		expect(result.newContextTokens).toBeUndefined()
		expect(mockApiHandler.createMessage).not.toHaveBeenCalled()
	})

	it("should return error when recent summary exists in kept messages", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Recent summary", ts: 6, isSummary: true }, // Summary in last 3 messages
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		const result = await summarizeConversation(
			messages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
		)

		// Should return original messages when recent summary exists
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0)
		expect(result.summary).toBe("")
		expect(result.error).toBeTruthy() // Error should be set
		expect(result.newContextTokens).toBeUndefined()
		expect(mockApiHandler.createMessage).not.toHaveBeenCalled()
	})

	it("should return error when both condensing and main API handlers are invalid", async () => {
		const messages: ApiMessage[] = [
			{ role: "user", content: "Hello", ts: 1 },
			{ role: "assistant", content: "Hi there", ts: 2 },
			{ role: "user", content: "How are you?", ts: 3 },
			{ role: "assistant", content: "I'm good", ts: 4 },
			{ role: "user", content: "What's new?", ts: 5 },
			{ role: "assistant", content: "Not much", ts: 6 },
			{ role: "user", content: "Tell me more", ts: 7 },
		]

		// Create invalid handlers (missing createMessage)
		const invalidMainHandler = {
			countTokens: vi.fn(),
			getModel: vi.fn(),
			// createMessage is missing
		} as unknown as ApiHandler

		const invalidCondensingHandler = {
			countTokens: vi.fn(),
			getModel: vi.fn(),
			// createMessage is missing
		} as unknown as ApiHandler

		// Mock console.error to verify error message
		const originalError = console.error
		const mockError = vi.fn()
		console.error = mockError

		const result = await summarizeConversation(
			messages,
			invalidMainHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined,
			invalidCondensingHandler,
		)

		// Should return original messages when both handlers are invalid
		expect(result.messages).toEqual(messages)
		expect(result.cost).toBe(0)
		expect(result.summary).toBe("")
		expect(result.error).toBeTruthy() // Error should be set
		expect(result.newContextTokens).toBeUndefined()

		// Verify error was logged
		expect(mockError).toHaveBeenCalledWith(
			expect.stringContaining("Main API handler is also invalid for condensing"),
		)

		// Restore console.error
		console.error = originalError
	})
})

describe("summarizeConversation with custom settings", () => {
	// Mock necessary dependencies
	let mockMainApiHandler: ApiHandler
	let mockCondensingApiHandler: ApiHandler
	const defaultSystemPrompt = "Default prompt"
	const taskId = "test-task"

	// Sample messages for testing
	const sampleMessages: ApiMessage[] = [
		{ role: "user", content: "Hello", ts: 1 },
		{ role: "assistant", content: "Hi there", ts: 2 },
		{ role: "user", content: "How are you?", ts: 3 },
		{ role: "assistant", content: "I'm good", ts: 4 },
		{ role: "user", content: "What's new?", ts: 5 },
		{ role: "assistant", content: "Not much", ts: 6 },
		{ role: "user", content: "Tell me more", ts: 7 },
	]

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()

		// Reset telemetry mock
		;(TelemetryService.instance.captureContextCondensed as Mock).mockClear()

		// Setup mock API handlers
		mockMainApiHandler = {
			createMessage: vi.fn().mockImplementation(() => {
				return (async function* () {
					yield { type: "text" as const, text: "Summary from main handler" }
					yield { type: "usage" as const, totalCost: 0.05, outputTokens: 100 }
				})()
			}),
			countTokens: vi.fn().mockImplementation(() => Promise.resolve(50)),
			getModel: vi.fn().mockReturnValue({
				id: "main-model",
				info: {
					contextWindow: 8000,
					supportsImages: true,
					supportsComputerUse: true,
					supportsVision: true,
					maxTokens: 4000,
					supportsPromptCache: true,
					maxCachePoints: 10,
					minTokensPerCachePoint: 100,
					cachableFields: ["system", "messages"],
				},
			}),
		} as unknown as ApiHandler

		mockCondensingApiHandler = {
			createMessage: vi.fn().mockImplementation(() => {
				return (async function* () {
					yield { type: "text" as const, text: "Summary from condensing handler" }
					yield { type: "usage" as const, totalCost: 0.03, outputTokens: 80 }
				})()
			}),
			countTokens: vi.fn().mockImplementation(() => Promise.resolve(40)),
			getModel: vi.fn().mockReturnValue({
				id: "condensing-model",
				info: {
					contextWindow: 4000,
					supportsImages: true,
					supportsComputerUse: false,
					supportsVision: false,
					maxTokens: 2000,
					supportsPromptCache: false,
					maxCachePoints: 0,
					minTokensPerCachePoint: 0,
					cachableFields: [],
				},
			}),
		} as unknown as ApiHandler
	})

	/**
	 * Test that custom prompt is used when provided
	 */
	it("should use custom prompt when provided", async () => {
		const customPrompt = "Custom summarization prompt"

		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			customPrompt,
		)

		// Verify the custom prompt was used
		const createMessageCalls = (mockMainApiHandler.createMessage as Mock).mock.calls
		expect(createMessageCalls.length).toBe(1)
		expect(createMessageCalls[0][0]).toBe(customPrompt)
	})

	/**
	 * Test that default system prompt is used when custom prompt is empty
	 */
	it("should use default systemPrompt when custom prompt is empty or not provided", async () => {
		// Test with empty string
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			"  ", // Empty custom prompt
		)

		// Verify the default prompt was used
		let createMessageCalls = (mockMainApiHandler.createMessage as Mock).mock.calls
		expect(createMessageCalls.length).toBe(1)
		expect(createMessageCalls[0][0]).toContain("Your task is to create a detailed summary")

		// Reset mock and test with undefined
		vi.clearAllMocks()
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined, // No custom prompt
		)

		// Verify the default prompt was used again
		createMessageCalls = (mockMainApiHandler.createMessage as Mock).mock.calls
		expect(createMessageCalls.length).toBe(1)
		expect(createMessageCalls[0][0]).toContain("Your task is to create a detailed summary")
	})

	/**
	 * Test that condensing API handler is used when provided and valid
	 */
	it("should use condensingApiHandler when provided and valid", async () => {
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined,
			mockCondensingApiHandler,
		)

		// Verify the condensing handler was used
		expect((mockCondensingApiHandler.createMessage as Mock).mock.calls.length).toBe(1)
		expect((mockMainApiHandler.createMessage as Mock).mock.calls.length).toBe(0)
	})

	/**
	 * Test fallback to main API handler when condensing handler is not provided
	 */
	it("should fall back to mainApiHandler if condensingApiHandler is not provided", async () => {
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined,
			undefined,
		)

		// Verify the main handler was used
		expect((mockMainApiHandler.createMessage as Mock).mock.calls.length).toBe(1)
	})

	/**
	 * Test fallback to main API handler when condensing handler is invalid
	 */
	it("should fall back to mainApiHandler if condensingApiHandler is invalid", async () => {
		// Create an invalid handler (missing createMessage)
		const invalidHandler = {
			countTokens: vi.fn(),
			getModel: vi.fn(),
			// createMessage is missing
		} as unknown as ApiHandler

		// Mock console.warn to verify warning message
		const originalWarn = console.warn
		const mockWarn = vi.fn()
		console.warn = mockWarn

		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined,
			invalidHandler,
		)

		// Verify the main handler was used as fallback
		expect((mockMainApiHandler.createMessage as Mock).mock.calls.length).toBe(1)

		// Verify warning was logged
		expect(mockWarn).toHaveBeenCalledWith(
			expect.stringContaining("Chosen API handler for condensing does not support message creation"),
		)

		// Restore console.warn
		console.warn = originalWarn
	})

	/**
	 * Test that telemetry is called for custom prompt usage
	 */
	it("should capture telemetry when using custom prompt", async () => {
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			"Custom prompt",
		)

		// Verify telemetry was called with custom prompt flag
		expect(TelemetryService.instance.captureContextCondensed).toHaveBeenCalledWith(
			taskId,
			false,
			true, // usedCustomPrompt
			false, // usedCustomApiHandler
		)
	})

	/**
	 * Test that telemetry is called for custom API handler usage
	 */
	it("should capture telemetry when using custom API handler", async () => {
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			false,
			undefined,
			mockCondensingApiHandler,
		)

		// Verify telemetry was called with custom API handler flag
		expect(TelemetryService.instance.captureContextCondensed).toHaveBeenCalledWith(
			taskId,
			false,
			false, // usedCustomPrompt
			true, // usedCustomApiHandler
		)
	})

	/**
	 * Test that telemetry is called with both custom prompt and API handler
	 */
	it("should capture telemetry when using both custom prompt and API handler", async () => {
		await summarizeConversation(
			sampleMessages,
			mockMainApiHandler,
			defaultSystemPrompt,
			taskId,
			DEFAULT_PREV_CONTEXT_TOKENS,
			true, // isAutomaticTrigger
			"Custom prompt",
			mockCondensingApiHandler,
		)

		// Verify telemetry was called with both flags
		expect(TelemetryService.instance.captureContextCondensed).toHaveBeenCalledWith(
			taskId,
			true, // isAutomaticTrigger
			true, // usedCustomPrompt
			true, // usedCustomApiHandler
		)
	})
})

describe("summarizeConversation with minimum token requirements", () => {
	// Mock ApiHandler
	let mockApiHandler: ApiHandler
	let mockCondensingApiHandler: ApiHandler
	const defaultSystemPrompt = "You are a helpful assistant."
	const taskId = "test-task-id"

	// Sample messages for testing
	const sampleMessages: ApiMessage[] = [
		{ role: "user", content: "Hello", ts: 1 },
		{ role: "assistant", content: "Hi there", ts: 2 },
		{ role: "user", content: "How are you?", ts: 3 },
		{ role: "assistant", content: "I'm good", ts: 4 },
		{ role: "user", content: "What's new?", ts: 5 },
		{ role: "assistant", content: "Not much", ts: 6 },
		{ role: "user", content: "Tell me more", ts: 7 },
	]

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks()

		// Setup mock API handler
		mockApiHandler = {
			createMessage: vi.fn(),
			countTokens: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: "test-model",
				info: {
					contextWindow: 8000,
					supportsImages: true,
					supportsComputerUse: true,
					supportsVision: true,
					maxTokens: 4000,
					supportsPromptCache: true,
					maxCachePoints: 10,
					minTokensPerCachePoint: 100,
					cachableFields: ["system", "messages"],
				},
			}),
		} as unknown as ApiHandler

		mockCondensingApiHandler = {
			createMessage: vi.fn(),
			countTokens: vi.fn(),
			getModel: vi.fn().mockReturnValue({
				id: "condensing-model",
				info: {
					contextWindow: 4000,
					supportsImages: true,
					supportsComputerUse: false,
					supportsVision: false,
					maxTokens: 2000,
					supportsPromptCache: false,
					maxCachePoints: 0,
					minTokensPerCachePoint: 0,
					cachableFields: [],
				},
			}),
		} as unknown as ApiHandler
	})

	it("should not expand summary when minimum tokens is not specified", async () => {
		// Setup initial summary stream
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Short summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 50 }
		})()

		mockApiHandler.createMessage = vi.fn().mockReturnValueOnce(initialStream) as any
		mockApiHandler.countTokens = vi.fn().mockResolvedValue(100) as any

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000, // prevContextTokens
			false,
			undefined,
			undefined,
			undefined, // No minimum tokens specified
		)

		// Should only call createMessage once (no expansion)
		expect(mockApiHandler.createMessage).toHaveBeenCalledTimes(1)
		expect(result.summary).toBe("Short summary")
		expect(result.newContextTokens).toBe(150) // 50 output + 100 counted
		expect(result.error).toBeUndefined()
	})

	it("should not expand summary when current tokens already meet minimum requirement", async () => {
		// Setup initial summary stream with enough tokens
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "This is a longer summary with more content" }
			yield { type: "usage" as const, totalCost: 0.05, outputTokens: 300 }
		})()

		mockApiHandler.createMessage = vi.fn().mockReturnValueOnce(initialStream) as any
		mockApiHandler.countTokens = vi.fn().mockResolvedValue(250) as any

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000, // prevContextTokens
			false,
			undefined,
			undefined,
			500, // minimumCondenseTokens - already met by 550 total
		)

		// Should only call createMessage once (no expansion needed)
		expect(mockApiHandler.createMessage).toHaveBeenCalledTimes(1)
		expect(result.summary).toBe("This is a longer summary with more content")
		expect(result.newContextTokens).toBe(550) // 300 output + 250 counted
		expect(result.error).toBeUndefined()
	})

	it("should expand summary when below minimum token requirement", async () => {
		// Setup initial summary stream with too few tokens
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Short summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 50 }
		})()

		// Setup expansion stream
		const expansionStream = (async function* () {
			yield {
				type: "text" as const,
				text: "This is a much more detailed and expanded summary with lots of additional context and information",
			}
			yield { type: "usage" as const, totalCost: 0.08, outputTokens: 400 }
		})()

		mockApiHandler.createMessage = vi
			.fn()
			.mockReturnValueOnce(initialStream)
			.mockReturnValueOnce(expansionStream) as any

		mockApiHandler.countTokens = vi
			.fn()
			.mockResolvedValueOnce(100) // First count after initial summary
			.mockResolvedValueOnce(150) // Count after first expansion attempt
			.mockResolvedValueOnce(150) as any // Count after second expansion attempt (final)

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000, // prevContextTokens
			false,
			undefined,
			undefined,
			500, // minimumCondenseTokens - requires expansion
		)

		// Should call createMessage three times (initial + 2 expansions due to mock setup)
		expect(mockApiHandler.createMessage).toHaveBeenCalledTimes(3)

		// Check the expansion request includes the expansion prompt
		const secondCall = (mockApiHandler.createMessage as Mock).mock.calls[1]
		const expansionMessages = secondCall[1]
		const lastMessage = expansionMessages[expansionMessages.length - 1]
		expect(lastMessage.content).toContain("The current summary has")
		expect(lastMessage.content).toContain("tokens, but we need at least")

		expect(result.summary).toBe(
			"This is a much more detailed and expanded summary with lots of additional context and information",
		)
		expect(result.newContextTokens).toBe(150) // Final count from mock
		expect(result.cost).toBe(0.1) // 0.02 + 0.08
		expect(result.error).toBeUndefined()
	})

	it("should use condensing API handler for expansion when provided", async () => {
		// Setup initial summary stream with too few tokens
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Short summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 50 }
		})()

		// Setup expansion stream from condensing handler
		const expansionStream = (async function* () {
			yield { type: "text" as const, text: "Expanded summary from condensing handler" }
			yield { type: "usage" as const, totalCost: 0.06, outputTokens: 350 }
		})()

		mockCondensingApiHandler.createMessage = vi
			.fn()
			.mockReturnValueOnce(initialStream)
			.mockReturnValueOnce(expansionStream) as any

		mockApiHandler.countTokens = vi
			.fn()
			.mockResolvedValueOnce(100) // First count
			.mockResolvedValueOnce(200) // After first expansion
			.mockResolvedValueOnce(200) as any // After second expansion (final)

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000, // prevContextTokens
			false,
			"Custom prompt",
			mockCondensingApiHandler,
			500, // minimumCondenseTokens
		)

		// Should use condensing handler for all calls (initial + expansions)
		expect(mockCondensingApiHandler.createMessage).toHaveBeenCalledTimes(3)
		expect(mockApiHandler.createMessage).not.toHaveBeenCalled()

		expect(result.summary).toBe("Expanded summary from condensing handler")
		expect(result.newContextTokens).toBe(200) // Final count from mock
		expect(result.cost).toBe(0.08) // 0.02 + 0.06
		expect(result.error).toBeUndefined()
	})

	it("should stop expansion after MAX_ITERATIONS to prevent infinite loops", async () => {
		// Setup streams that always return insufficient tokens
		const createSmallStream = () =>
			(async function* () {
				yield { type: "text" as const, text: "Still too short" }
				yield { type: "usage" as const, totalCost: 0.01, outputTokens: 30 }
			})()

		let callCount = 0
		mockApiHandler.createMessage = vi.fn().mockImplementation(() => {
			callCount++
			return createSmallStream()
		}) as any

		// Always return low token count
		mockApiHandler.countTokens = vi.fn().mockResolvedValue(50) as any

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			2000, // prevContextTokens
			false,
			undefined,
			undefined,
			1000, // minimumCondenseTokens - impossible to reach
		)

		// Should stop after MAX_ITERATIONS (5) + 1 initial call = 6 total
		expect(mockApiHandler.createMessage).toHaveBeenCalledTimes(6)
		expect(result.summary).toBe("Still too short")
		expect(result.error).toBeUndefined()
	})

	it("should revert to previous summary if expansion exceeds context limit", async () => {
		// Setup initial summary stream
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Initial summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 100 }
		})()

		// Setup expansion stream that's too large
		const expansionStream = (async function* () {
			yield { type: "text" as const, text: "Extremely long expanded summary that exceeds context" }
			yield { type: "usage" as const, totalCost: 0.1, outputTokens: 800 }
		})()

		mockApiHandler.createMessage = vi
			.fn()
			.mockReturnValueOnce(initialStream)
			.mockReturnValueOnce(expansionStream) as any

		mockApiHandler.countTokens = vi
			.fn()
			.mockResolvedValueOnce(150) // First count
			.mockResolvedValueOnce(500) as any // After expansion - too large!

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			400, // prevContextTokens - will be exceeded
			false,
			undefined,
			undefined,
			300, // minimumCondenseTokens
		)

		// Should revert to initial summary
		expect(result.summary).toBe("Initial summary")
		expect(result.newContextTokens).toBe(250) // 100 output + 150 counted (initial)
		expect(result.cost).toBeCloseTo(0.02, 5) // Only initial cost, expansion cost excluded
		expect(result.error).toBeUndefined()
	})

	it("should handle empty expansion response gracefully", async () => {
		// Setup initial summary stream
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Initial summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 100 }
		})()

		// Setup empty expansion stream
		const emptyExpansionStream = (async function* () {
			yield { type: "text" as const, text: "" }
			yield { type: "usage" as const, totalCost: 0.01, outputTokens: 0 }
		})()

		mockApiHandler.createMessage = vi
			.fn()
			.mockReturnValueOnce(initialStream)
			.mockReturnValueOnce(emptyExpansionStream) as any

		mockApiHandler.countTokens = vi.fn().mockResolvedValue(150) as any

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000, // prevContextTokens
			false,
			undefined,
			undefined,
			500, // minimumCondenseTokens - requires expansion but gets empty response
		)

		// Should keep initial summary when expansion fails
		expect(result.summary).toBe("Initial summary")
		expect(result.newContextTokens).toBe(250) // 100 output + 150 counted
		expect(result.cost).toBe(0.02) // Only initial cost since expansion produced empty result
		expect(result.error).toBeUndefined()
	})

	it("should use custom prompt for expansion when provided", async () => {
		const customPrompt = "Custom summarization instructions"

		// Setup initial summary stream with too few tokens
		const initialStream = (async function* () {
			yield { type: "text" as const, text: "Short summary" }
			yield { type: "usage" as const, totalCost: 0.02, outputTokens: 50 }
		})()

		// Setup expansion stream
		const expansionStream = (async function* () {
			yield { type: "text" as const, text: "Expanded with custom prompt" }
			yield { type: "usage" as const, totalCost: 0.05, outputTokens: 300 }
		})()

		mockApiHandler.createMessage = vi
			.fn()
			.mockReturnValueOnce(initialStream)
			.mockReturnValueOnce(expansionStream) as any

		mockApiHandler.countTokens = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(200) as any

		const result = await summarizeConversation(
			sampleMessages,
			mockApiHandler,
			defaultSystemPrompt,
			taskId,
			1000,
			false,
			customPrompt, // Custom prompt provided
			undefined,
			400, // minimumCondenseTokens
		)

		// Check that custom prompt was used in expansion
		const expansionCall = (mockApiHandler.createMessage as Mock).mock.calls[1]
		expect(expansionCall[0]).toBe(customPrompt)

		expect(result.summary).toBe("Expanded with custom prompt")
		expect(result.error).toBeUndefined()
	})
})
