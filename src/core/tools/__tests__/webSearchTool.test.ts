import { describe, it, expect, vi, beforeEach } from "vitest"
import { webSearchTool } from "../webSearchTool"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"

describe("webSearchTool", () => {
	let mockCline: any
	let mockBlock: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		// Create mock Task instance
		mockCline = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			recordToolUsage: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn().mockResolvedValue(undefined),
		}

		// Create mock block
		mockBlock = {
			name: "web_search",
			params: {
				query: "test search query",
			},
			partial: false,
		}

		// Create mock functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, text) => text || "")
	})

	it("should handle missing query parameter", async () => {
		mockBlock.params.query = undefined

		await webSearchTool(
			mockCline as unknown as Task,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.consecutiveMistakeCount).toBe(1)
		expect(mockCline.recordToolError).toHaveBeenCalledWith("web_search")
		expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith("web_search", "query")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
	})

	it("should skip execution when block is partial", async () => {
		mockBlock.partial = true

		await webSearchTool(
			mockCline as unknown as Task,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).not.toHaveBeenCalled()
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})

	it("should handle user rejection", async () => {
		mockAskApproval.mockResolvedValue(false)

		await webSearchTool(
			mockCline as unknown as Task,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockAskApproval).toHaveBeenCalled()
		expect(mockPushToolResult).not.toHaveBeenCalled()
		expect(mockCline.recordToolUsage).not.toHaveBeenCalled()
	})

	it("should perform search and return results when approved", async () => {
		await webSearchTool(
			mockCline as unknown as Task,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Verify approval was requested
		expect(mockAskApproval).toHaveBeenCalledWith(
			"tool",
			JSON.stringify({
				tool: "webSearch",
				query: "test search query",
			}),
		)

		// Verify search was logged
		expect(mockCline.say).toHaveBeenCalledWith("text", 'Searching the web for: "test search query"')

		// Verify tool usage was recorded
		expect(mockCline.recordToolUsage).toHaveBeenCalledWith("web_search")

		// Verify results were pushed
		expect(mockPushToolResult).toHaveBeenCalled()
		const resultCall = mockPushToolResult.mock.calls[0][0]
		expect(resultCall).toContain("Web search results")
		expect(resultCall).toContain("test search query")
	})

	it("should handle errors during search", async () => {
		const testError = new Error("Search failed")
		mockCline.say.mockRejectedValueOnce(testError)

		await webSearchTool(
			mockCline as unknown as Task,
			mockBlock,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockHandleError).toHaveBeenCalledWith("performing web search", testError)
		expect(mockCline.recordToolError).toHaveBeenCalledWith("web_search")
	})
})
