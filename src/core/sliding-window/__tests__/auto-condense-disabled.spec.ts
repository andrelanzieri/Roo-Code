// npx vitest src/core/sliding-window/__tests__/auto-condense-disabled.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { BaseProvider } from "../../../api/providers/base-provider"
import { ApiMessage } from "../../task-persistence/apiMessages"
import * as condenseModule from "../../condense"
import { truncateConversationIfNeeded } from "../index"

// Create a mock ApiHandler for testing
class MockApiHandler extends BaseProvider {
	createMessage(): any {
		// Mock implementation for testing - returns an async iterable stream
		const mockStream = {
			async *[Symbol.asyncIterator]() {
				yield { type: "text", text: "Mock summary content" }
				yield { type: "usage", inputTokens: 100, outputTokens: 50 }
			},
		}
		return mockStream
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "test-model",
			info: {
				contextWindow: 100000,
				maxTokens: 50000,
				supportsPromptCache: true,
				supportsImages: false,
				inputPrice: 0,
				outputPrice: 0,
				description: "Test model",
			},
		}
	}
}

// Create a singleton instance for tests
const mockApiHandler = new MockApiHandler()
const taskId = "test-task-id"

describe("Auto-condense disabled behavior", () => {
	beforeEach(() => {
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}
		vi.clearAllMocks()
	})

	const createModelInfo = (contextWindow: number, maxTokens?: number): ModelInfo => ({
		contextWindow,
		supportsPromptCache: true,
		maxTokens,
	})

	const messages: ApiMessage[] = [
		{ role: "user", content: "First message" },
		{ role: "assistant", content: "Second message" },
		{ role: "user", content: "Third message" },
		{ role: "assistant", content: "Fourth message" },
		{ role: "user", content: "Fifth message" },
	]

	it("should NOT condense when autoCondenseContext is false and tokens are below limit", async () => {
		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation")
		const modelInfo = createModelInfo(100000, 30000)

		// Set tokens below the limit
		const totalTokens = 50000 // Below the 60000 limit (100000 * 0.9 - 30000)
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		const result = await truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
			apiHandler: mockApiHandler,
			autoCondenseContext: false, // Disabled
			autoCondenseContextPercent: 50, // Should be ignored
			systemPrompt: "System prompt",
			taskId,
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should NOT call summarizeConversation
		expect(summarizeSpy).not.toHaveBeenCalled()

		// Should return original messages
		expect(result.messages).toEqual(messagesWithSmallContent)
		expect(result.summary).toBe("")
		expect(result.cost).toBe(0)

		summarizeSpy.mockRestore()
	})

	it("should use sliding window truncation when autoCondenseContext is false and tokens exceed limit", async () => {
		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation")
		const modelInfo = createModelInfo(100000, 30000)

		// Set tokens above the limit
		const totalTokens = 70001 // Above the 60000 limit
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		const result = await truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
			apiHandler: mockApiHandler,
			autoCondenseContext: false, // Disabled
			autoCondenseContextPercent: 50, // Should be ignored
			systemPrompt: "System prompt",
			taskId,
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should NOT call summarizeConversation
		expect(summarizeSpy).not.toHaveBeenCalled()

		// Should use sliding window truncation (removes 2 messages with 0.5 fraction)
		const expectedMessages = [messagesWithSmallContent[0], messagesWithSmallContent[3], messagesWithSmallContent[4]]
		expect(result.messages).toEqual(expectedMessages)
		expect(result.summary).toBe("") // No summary when using sliding window
		expect(result.cost).toBe(0)

		summarizeSpy.mockRestore()
	})

	it("should NOT condense even when percentage threshold is exceeded if autoCondenseContext is false", async () => {
		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation")
		const modelInfo = createModelInfo(100000, 30000)

		// Set tokens to 80% of context window (exceeds typical percentage thresholds)
		const totalTokens = 80000
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		const result = await truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
			apiHandler: mockApiHandler,
			autoCondenseContext: false, // Disabled
			autoCondenseContextPercent: 50, // 80% exceeds this, but should be ignored
			systemPrompt: "System prompt",
			taskId,
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should NOT call summarizeConversation even though percentage is exceeded
		expect(summarizeSpy).not.toHaveBeenCalled()

		// Should use sliding window truncation since tokens exceed hard limit
		const expectedMessages = [messagesWithSmallContent[0], messagesWithSmallContent[3], messagesWithSmallContent[4]]
		expect(result.messages).toEqual(expectedMessages)
		expect(result.summary).toBe("")
		expect(result.cost).toBe(0)

		summarizeSpy.mockRestore()
	})

	it("should respect autoCondenseContext setting in forced truncation scenarios", async () => {
		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation")
		const modelInfo = createModelInfo(100000, 30000)

		// Simulate a forced truncation scenario (e.g., context window exceeded)
		// This would be called from handleContextWindowExceededError
		const totalTokens = 95000 // Way above limit, simulating context window error
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		// Test with autoCondenseContext = false (user preference)
		const result = await truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
			apiHandler: mockApiHandler,
			autoCondenseContext: false, // User has disabled auto-condense
			autoCondenseContextPercent: 75, // FORCED_CONTEXT_REDUCTION_PERCENT
			systemPrompt: "System prompt",
			taskId,
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should NOT call summarizeConversation, respecting user preference
		expect(summarizeSpy).not.toHaveBeenCalled()

		// Should use sliding window truncation instead
		const expectedMessages = [messagesWithSmallContent[0], messagesWithSmallContent[3], messagesWithSmallContent[4]]
		expect(result.messages).toEqual(expectedMessages)
		expect(result.summary).toBe("")
		expect(result.cost).toBe(0)

		summarizeSpy.mockRestore()
	})

	it("should use condensing when autoCondenseContext is true and tokens exceed limit", async () => {
		// This is a control test to ensure condensing still works when enabled
		const mockSummary = "This is a summary"
		const mockCost = 0.05
		const mockSummarizeResponse: condenseModule.SummarizeResponse = {
			messages: [
				{ role: "user", content: "First message" },
				{ role: "assistant", content: mockSummary, isSummary: true },
				{ role: "user", content: "Last message" },
			],
			summary: mockSummary,
			cost: mockCost,
			newContextTokens: 100,
		}

		const summarizeSpy = vi.spyOn(condenseModule, "summarizeConversation").mockResolvedValue(mockSummarizeResponse)

		const modelInfo = createModelInfo(100000, 30000)
		const totalTokens = 70001 // Above limit
		const messagesWithSmallContent = [...messages.slice(0, -1), { ...messages[messages.length - 1], content: "" }]

		const result = await truncateConversationIfNeeded({
			messages: messagesWithSmallContent,
			totalTokens,
			contextWindow: modelInfo.contextWindow,
			maxTokens: modelInfo.maxTokens,
			apiHandler: mockApiHandler,
			autoCondenseContext: true, // Enabled
			autoCondenseContextPercent: 100,
			systemPrompt: "System prompt",
			taskId,
			profileThresholds: {},
			currentProfileId: "default",
		})

		// Should call summarizeConversation when enabled
		expect(summarizeSpy).toHaveBeenCalled()

		// Should return condensed result
		expect(result.messages).toEqual(mockSummarizeResponse.messages)
		expect(result.summary).toBe(mockSummary)
		expect(result.cost).toBe(mockCost)

		summarizeSpy.mockRestore()
	})
})
