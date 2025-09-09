import { vi, describe, it, expect, beforeEach } from "vitest"
import { readFileTool } from "../readFileTool"
import { Task } from "../../task/Task"
import { ReadFileToolUse } from "../../../shared/tools"

describe("readFileTool - empty path handling", () => {
	let mockCline: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		mockCline = {
			cwd: "/test",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn(),
			rooIgnoreController: undefined,
			api: {
				getModel: () => ({ info: { supportsImages: false } }),
			},
		}

		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn()
	})

	it("should provide clear error message for empty path elements", async () => {
		const toolUse: ReadFileToolUse = {
			type: "tool_use",
			name: "read_file",
			params: {
				args: `<file><path></path></file>`,
			},
			partial: false,
		}

		await readFileTool(
			mockCline as unknown as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Should handle the error with a clear message
		expect(mockHandleError).toHaveBeenCalledWith(
			"parsing read_file args",
			expect.objectContaining({
				message: "All file paths are empty or missing. Please provide valid file paths in the <path> elements.",
			}),
		)

		// Should push the error result
		expect(mockPushToolResult).toHaveBeenCalledWith(
			`<files><error>All file paths are empty or missing. Please provide valid file paths in the <path> elements.</error></files>`,
		)
	})

	it("should provide clear error message for whitespace-only path elements", async () => {
		const toolUse: ReadFileToolUse = {
			type: "tool_use",
			name: "read_file",
			params: {
				args: `<file><path>   </path></file>`,
			},
			partial: false,
		}

		await readFileTool(
			mockCline as unknown as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Should handle the error with a clear message
		expect(mockHandleError).toHaveBeenCalledWith(
			"parsing read_file args",
			expect.objectContaining({
				message: "All file paths are empty or missing. Please provide valid file paths in the <path> elements.",
			}),
		)

		// Should push the error result
		expect(mockPushToolResult).toHaveBeenCalledWith(
			`<files><error>All file paths are empty or missing. Please provide valid file paths in the <path> elements.</error></files>`,
		)
	})

	// Note: Testing the case where some paths are empty but others are valid
	// would require extensive mocking of file system operations.
	// The core functionality is tested by the other tests which verify
	// that empty paths are properly detected and reported.

	it("should handle multiple empty paths", async () => {
		const toolUse: ReadFileToolUse = {
			type: "tool_use",
			name: "read_file",
			params: {
				args: `<file><path></path></file><file><path>   </path></file><file><path/></file>`,
			},
			partial: false,
		}

		await readFileTool(
			mockCline as unknown as Task,
			toolUse,
			mockAskApproval,
			mockHandleError,
			mockPushToolResult,
			mockRemoveClosingTag,
		)

		// Should handle the error with a clear message
		expect(mockHandleError).toHaveBeenCalledWith(
			"parsing read_file args",
			expect.objectContaining({
				message: "All file paths are empty or missing. Please provide valid file paths in the <path> elements.",
			}),
		)
	})
})
