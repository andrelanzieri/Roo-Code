import { describe, it, expect, vi, beforeEach } from "vitest"
import { OpenRouterHandler } from "../openrouter"
import type { ApiHandlerOptions } from "../../../shared/api"

// Mock the fetchers
vi.mock("../fetchers/modelCache", () => ({
	getModels: vi.fn().mockResolvedValue({
		"deepseek/deepseek-v3.1-terminus": {
			maxTokens: 8192,
			contextWindow: 128000,
			supportsImages: false,
			supportsPromptCache: false,
			supportsReasoningEffort: true,
			inputPrice: 0.5,
			outputPrice: 2.0,
			description: "DeepSeek V3.1 Terminus model",
		},
	}),
}))

vi.mock("../fetchers/modelEndpointCache", () => ({
	getModelEndpoints: vi.fn().mockResolvedValue({}),
}))

// Mock OpenAI client
vi.mock("openai", () => {
	const mockStream = {
		[Symbol.asyncIterator]: async function* () {
			yield {
				choices: [{ delta: { content: "Test response" } }],
				usage: {
					prompt_tokens: 10,
					completion_tokens: 5,
					total_tokens: 15,
				},
			}
		},
	}

	return {
		default: vi.fn().mockImplementation(() => ({
			chat: {
				completions: {
					create: vi.fn().mockResolvedValue(mockStream),
				},
			},
		})),
	}
})

describe("OpenRouterHandler - DeepSeek V3.1 Terminus", () => {
	let handler: OpenRouterHandler
	let mockCreate: any

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should exclude reasoning for DeepSeek V3.1 Terminus when reasoning is not enabled", async () => {
		const options: ApiHandlerOptions = {
			openRouterApiKey: "test-key",
			openRouterModelId: "deepseek/deepseek-v3.1-terminus",
			enableReasoningEffort: false,
		}

		handler = new OpenRouterHandler(options)

		// Spy on the OpenAI client's create method
		mockCreate = vi.fn().mockResolvedValue({
			[Symbol.asyncIterator]: async function* () {
				yield {
					choices: [{ delta: { content: "Test" } }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				}
			},
		})
		;(handler as any).client.chat.completions.create = mockCreate

		// Create a message
		const generator = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		// Consume the generator
		const results = []
		for await (const chunk of generator) {
			results.push(chunk)
		}

		// Check that the create method was called with reasoning excluded
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "deepseek/deepseek-v3.1-terminus",
				reasoning: { exclude: true },
			}),
		)
	})

	it("should not exclude reasoning for DeepSeek V3.1 Terminus when reasoning is enabled", async () => {
		const options: ApiHandlerOptions = {
			openRouterApiKey: "test-key",
			openRouterModelId: "deepseek/deepseek-v3.1-terminus",
			enableReasoningEffort: true,
			reasoningEffort: "medium",
		}

		handler = new OpenRouterHandler(options)

		// Spy on the OpenAI client's create method
		mockCreate = vi.fn().mockResolvedValue({
			[Symbol.asyncIterator]: async function* () {
				yield {
					choices: [{ delta: { content: "Test" } }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				}
			},
		})
		;(handler as any).client.chat.completions.create = mockCreate

		// Create a message
		const generator = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		// Consume the generator
		const results = []
		for await (const chunk of generator) {
			results.push(chunk)
		}

		// Check that the create method was called with reasoning effort
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "deepseek/deepseek-v3.1-terminus",
				reasoning: { effort: "medium" },
			}),
		)
	})

	it("should not affect other models", async () => {
		const options: ApiHandlerOptions = {
			openRouterApiKey: "test-key",
			openRouterModelId: "anthropic/claude-3-sonnet",
			enableReasoningEffort: false,
		}

		// Mock a different model
		const { getModels } = await import("../fetchers/modelCache")
		vi.mocked(getModels).mockResolvedValue({
			"anthropic/claude-3-sonnet": {
				maxTokens: 4096,
				contextWindow: 200000,
				supportsImages: true,
				supportsPromptCache: true,
				inputPrice: 3.0,
				outputPrice: 15.0,
				description: "Claude 3 Sonnet",
			},
		})

		handler = new OpenRouterHandler(options)

		// Spy on the OpenAI client's create method
		mockCreate = vi.fn().mockResolvedValue({
			[Symbol.asyncIterator]: async function* () {
				yield {
					choices: [{ delta: { content: "Test" } }],
					usage: { prompt_tokens: 10, completion_tokens: 5 },
				}
			},
		})
		;(handler as any).client.chat.completions.create = mockCreate

		// Create a message
		const generator = handler.createMessage("System prompt", [{ role: "user", content: "Test message" }])

		// Consume the generator
		const results = []
		for await (const chunk of generator) {
			results.push(chunk)
		}

		// Check that reasoning was not excluded for other models
		expect(mockCreate).toHaveBeenCalledWith(
			expect.not.objectContaining({
				reasoning: { exclude: true },
			}),
		)
	})

	it("should exclude reasoning in completePrompt for DeepSeek V3.1 Terminus", async () => {
		const options: ApiHandlerOptions = {
			openRouterApiKey: "test-key",
			openRouterModelId: "deepseek/deepseek-v3.1-terminus",
			enableReasoningEffort: false,
		}

		handler = new OpenRouterHandler(options)

		// Mock the non-streaming response
		mockCreate = vi.fn().mockResolvedValue({
			choices: [{ message: { content: "Test response" } }],
		})
		;(handler as any).client.chat.completions.create = mockCreate

		// Call completePrompt
		await handler.completePrompt("Test prompt")

		// Check that the create method was called with reasoning excluded
		expect(mockCreate).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "deepseek/deepseek-v3.1-terminus",
				reasoning: { exclude: true },
				stream: false,
			}),
		)
	})
})
