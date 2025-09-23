import { describe, it, expect, vi, beforeEach } from "vitest"
import { searchAndReplaceTool } from "../searchAndReplaceTool"
import { Task } from "../../task/Task"
import * as fs from "fs/promises"
import * as pathUtils from "../../../utils/path"
import * as fsUtils from "../../../utils/fs"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/path")
vi.mock("../../../utils/fs")
vi.mock("delay", () => ({
	default: vi.fn(() => Promise.resolve()),
}))

describe("searchAndReplaceTool", () => {
	let mockCline: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock Cline instance
		mockCline = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			didEditFile: false,
			recordToolError: vi.fn(),
			recordToolUsage: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue(undefined),
			rooIgnoreController: {
				validateAccess: vi.fn().mockReturnValue(true),
			},
			rooProtectedController: {
				isWriteProtected: vi.fn().mockReturnValue(false),
			},
			fileContextTracker: {
				trackFileContext: vi.fn().mockResolvedValue(undefined),
			},
			diffViewProvider: {
				editType: undefined,
				originalContent: undefined,
				reset: vi.fn().mockResolvedValue(undefined),
				open: vi.fn().mockResolvedValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
				scrollToFirstDiff: vi.fn(),
				revertChanges: vi.fn().mockResolvedValue(undefined),
				saveChanges: vi.fn().mockResolvedValue(undefined),
				saveDirectly: vi.fn().mockResolvedValue(undefined),
				pushToolWriteResult: vi.fn().mockResolvedValue("File modified successfully"),
			},
			providerRef: {
				deref: vi.fn().mockReturnValue({
					getState: vi.fn().mockResolvedValue({
						diagnosticsEnabled: true,
						writeDelayMs: 100,
						experiments: {},
					}),
				}),
			},
			processQueuedMessages: vi.fn(),
		}

		// Setup other mocks
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, value) => value || "")

		// Mock file system operations
		vi.mocked(fsUtils.fileExistsAtPath).mockResolvedValue(true)
		vi.mocked(pathUtils.getReadablePath).mockImplementation((cwd, path) => path || "")
	})

	describe("array accessor and optional chaining handling", () => {
		it("should correctly handle simple array accessor patterns", async () => {
			const fileContent = `const result = data?.items?.[0]?.values?.[1];`
			const expectedContent = `const result = data?.items?.[0]?.values?.[2];`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "data?.items?.[0]?.values?.[1]",
					replace: "data?.items?.[0]?.values?.[2]",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the file was read
			expect(fs.readFile).toHaveBeenCalledWith("/test/workspace/test.js", "utf-8")

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)

			// Verify no errors occurred
			expect(mockHandleError).not.toHaveBeenCalled()
			expect(mockCline.recordToolError).not.toHaveBeenCalled()
		})

		it("should handle complex nested array accessors", async () => {
			const fileContent = `const value = obj?.nested?.arrays?.[0]?.[1]?.id;`
			const expectedContent = `const value = obj?.nested?.arrays?.[1]?.[0]?.id;`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "obj?.nested?.arrays?.[0]?.[1]?.id",
					replace: "obj?.nested?.arrays?.[1]?.[0]?.id",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)

			// Verify success
			expect(mockPushToolResult).toHaveBeenCalledWith("File modified successfully")
			expect(mockCline.recordToolUsage).toHaveBeenCalledWith("search_and_replace")
		})

		it("should handle multiple occurrences of array accessor patterns", async () => {
			const fileContent = `
const a = data?.[0]?.value;
const b = data?.[0]?.value;
const c = other?.[0]?.value;
`
			const expectedContent = `
const a = data?.[1]?.value;
const b = data?.[1]?.value;
const c = other?.[0]?.value;
`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "data?.[0]?.value",
					replace: "data?.[1]?.value",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)
		})

		it("should handle bracket notation without optional chaining", async () => {
			const fileContent = `const value = data[0].items[1];`
			const expectedContent = `const value = data[1].items[2];`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "data[0].items[1]",
					replace: "data[1].items[2]",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)
		})

		it("should handle mixed dot and bracket notation", async () => {
			const fileContent = `const result = obj.prop?.[0]?.nested.value?.[1];`
			const expectedContent = `const result = obj.prop?.[1]?.nested.value?.[0];`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "obj.prop?.[0]?.nested.value?.[1]",
					replace: "obj.prop?.[1]?.nested.value?.[0]",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)
		})
	})

	describe("existing functionality", () => {
		it("should handle regular text replacement", async () => {
			const fileContent = `function oldFunction() { return "old"; }`
			const expectedContent = `function newFunction() { return "old"; }`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "oldFunction",
					replace: "newFunction",
					use_regex: "false",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)
		})

		it("should handle regex patterns when use_regex is true", async () => {
			const fileContent = `var x = 10; var y = 20; var z = 30;`
			const expectedContent = `let x = 10; let y = 20; let z = 30;`

			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const block = {
				name: "search_and_replace",
				params: {
					path: "test.js",
					search: "\\bvar\\b",
					replace: "let",
					use_regex: "true",
				},
			}

			await searchAndReplaceTool(
				mockCline as unknown as Task,
				block as any,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify the diff view was updated with correct content
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expectedContent, true)
		})
	})
})
