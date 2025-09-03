import { describe, it, expect, vi, beforeEach } from "vitest"
import { editAndExecuteTool } from "../editAndExecuteTool"
import { Task } from "../../task/Task"
import { ToolUse } from "../../../shared/tools"
import * as writeToFileToolModule from "../writeToFileTool"
import * as executeCommandToolModule from "../executeCommandTool"

// Mock the imported tool modules
vi.mock("../writeToFileTool")
vi.mock("../executeCommandTool")
vi.mock("../applyDiffTool")
vi.mock("../insertContentTool")
vi.mock("../searchAndReplaceTool")

describe("editAndExecuteTool", () => {
	let mockCline: Task
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Create mock Cline instance
		mockCline = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			recordToolUsage: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			ask: vi.fn().mockResolvedValue({}),
			cwd: "/test/workspace",
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({ experiments: {} }),
				}),
			},
		} as any

		// Create mock functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, content) => content)
	})

	it("should handle missing args parameter", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "edit_and_execute",
			params: {},
			partial: false,
		}

		await editAndExecuteTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.consecutiveMistakeCount).toBe(1)
		expect(mockCline.recordToolError).toHaveBeenCalledWith("edit_and_execute")
		expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
	})

	it("should handle missing edit block", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "edit_and_execute",
			params: {
				args: "<execute><execute_command><command>ls</command></execute_command></execute>",
			},
			partial: false,
		}

		await editAndExecuteTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.consecutiveMistakeCount).toBe(1)
		expect(mockCline.recordToolError).toHaveBeenCalledWith("edit_and_execute")
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Missing or invalid <edit> block"))
	})

	it("should handle missing execute block", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "edit_and_execute",
			params: {
				args: "<edit><write_to_file><path>test.txt</path><content>hello</content></write_to_file></edit>",
			},
			partial: false,
		}

		await editAndExecuteTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.consecutiveMistakeCount).toBe(1)
		expect(mockCline.recordToolError).toHaveBeenCalledWith("edit_and_execute")
		expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Missing or invalid <execute> block"))
	})

	it("should handle partial blocks", async () => {
		const block: ToolUse = {
			type: "tool_use",
			name: "edit_and_execute",
			params: {
				args: "partial content",
			},
			partial: true,
		}

		await editAndExecuteTool(
			mockCline,
			block,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		expect(mockCline.ask).toHaveBeenCalledWith(
			"tool",
			expect.stringContaining("Processing edit and execute operation"),
			true,
		)
		expect(mockPushToolResult).not.toHaveBeenCalled()
	})
})
