import { vi } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"

import type { ApiHandlerOptions } from "../../../shared/api"

// Mock OpenAI before imports
const mockCreate = vi.fn()
const mockStreamGenerator = vi.fn()

vi.mock("openai", () => {
	return {
		__esModule: true,
		default: vi.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate,
				},
			},
		})),
		AzureOpenAI: vi.fn(),
	}
})

import { DeepSeekHandler } from "../deepseek"

describe("DeepSeekHandler - Timeout and Python Pattern Handling", () => {
	let handler: DeepSeekHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			deepSeekApiKey: "test-api-key",
			apiModelId: "deepseek-chat",
			deepSeekBaseUrl: "https://api.deepseek.com",
		}
		handler = new DeepSeekHandler(mockOptions)
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	describe("timeout handling", () => {
		it.skip("should timeout if no response within 30 seconds", async () => {
			// Create a controlled async generator that we can make hang
			const hangingGenerator = async function* () {
				// This will hang forever unless interrupted
				await new Promise((resolve) => {
					// Store resolve for cleanup but never call it during test
					;(global as any).__testResolve = resolve
				})
				yield { type: "text", text: "This should never be reached" }
			}

			// Override parent's createMessage to return our hanging generator
			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(() =>
				hangingGenerator(),
			)

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Analyze this Python file with main function",
				},
			]

			const stream = handler.createMessage(systemPrompt, messages)

			// Create a promise to consume the stream and capture any error
			const consumePromise = (async () => {
				const chunks: any[] = []
				for await (const chunk of stream) {
					chunks.push(chunk)
				}
				return chunks
			})()

			// Advance time to trigger the timeout
			vi.advanceTimersByTime(30000)

			// Wait for the timeout to be processed
			await vi.runAllTimersAsync()

			// The consume promise should now reject with timeout error
			await expect(consumePromise).rejects.toThrow("DeepSeek API request timed out after 30 seconds")

			// Clean up the hanging promise
			if ((global as any).__testResolve) {
				;(global as any).__testResolve()
				delete (global as any).__testResolve
			}
		})

		it("should not timeout if response is received within 30 seconds", async () => {
			// Set up mock to resolve quickly
			mockStreamGenerator.mockImplementation(async function* () {
				yield { type: "text", text: "Response received" }
				yield { type: "usage", inputTokens: 10, outputTokens: 5 }
			})

			// Override parent's createMessage to return our mock stream
			const originalCreateMessage = Object.getPrototypeOf(Object.getPrototypeOf(handler)).createMessage
			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(
				mockStreamGenerator,
			)

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
			expect(chunks[0].text).toBe("Response received")
		})
	})

	describe("Python pattern preprocessing", () => {
		it("should preprocess Python main function patterns", async () => {
			const systemPrompt = "You are a helpful assistant."
			const pythonCode = `
def main():
    print("Hello, World!")

if __name__ == "__main__":
    main()
`
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: pythonCode,
				},
			]

			// Spy on the preprocessMessages method
			const preprocessSpy = vi.spyOn(handler as any, "preprocessMessages")

			// Set up mock response
			mockStreamGenerator.mockImplementation(async function* () {
				yield { type: "text", text: "Processed Python code" }
			})

			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(
				mockStreamGenerator,
			)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify preprocessing was called
			expect(preprocessSpy).toHaveBeenCalled()
			const processedMessages = preprocessSpy.mock.results[0].value

			// Check that the messages were processed
			expect(processedMessages[0].content).toContain('if __name__ == "__main__"')
			expect(processedMessages[0].content).toContain("def main()")
		})

		it("should handle array content with Python patterns", async () => {
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text",
							text: "Here's my Python code:\ndef main():\n    pass\n\nif __name__ == '__main__':\n    main()",
						},
					],
				},
			]

			const preprocessSpy = vi.spyOn(handler as any, "preprocessMessages")

			mockStreamGenerator.mockImplementation(async function* () {
				yield { type: "text", text: "Processed" }
			})

			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(
				mockStreamGenerator,
			)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(preprocessSpy).toHaveBeenCalled()
			const processedMessages = preprocessSpy.mock.results[0].value

			// Verify array content was processed
			expect(processedMessages[0].content[0].text).toContain('if __name__ == "__main__"')
		})

		it("should not modify non-Python content", async () => {
			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Just a regular message without Python code",
				},
			]

			const preprocessSpy = vi.spyOn(handler as any, "preprocessMessages")

			mockStreamGenerator.mockImplementation(async function* () {
				yield { type: "text", text: "Response" }
			})

			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(
				mockStreamGenerator,
			)

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []

			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(preprocessSpy).toHaveBeenCalled()
			const processedMessages = preprocessSpy.mock.results[0].value

			// Content should remain unchanged
			expect(processedMessages[0].content).toBe("Just a regular message without Python code")
		})
	})

	describe("error handling", () => {
		it("should properly re-throw non-timeout errors", async () => {
			const testError = new Error("Network error")

			// eslint-disable-next-line require-yield
			mockStreamGenerator.mockImplementation(async function* () {
				throw testError
			})

			vi.spyOn(Object.getPrototypeOf(Object.getPrototypeOf(handler)), "createMessage").mockImplementation(
				mockStreamGenerator,
			)

			const systemPrompt = "You are a helpful assistant."
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Test",
				},
			]

			const streamPromise = handler.createMessage(systemPrompt, messages)

			await expect(
				(async () => {
					const chunks = []
					for await (const chunk of streamPromise) {
						chunks.push(chunk)
					}
				})(),
			).rejects.toThrow("Network error")
		})
	})
})
