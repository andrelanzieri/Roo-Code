import { describe, it, expect, vi, beforeEach } from "vitest"
import { codebaseSearchTool } from "../codebaseSearchTool"
import { CodeIndexManager } from "../../../services/code-index/manager"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"
import * as vscode from "vscode"

// Mock dependencies
vi.mock("../../../services/code-index/manager")
vi.mock("../../prompts/responses")
vi.mock("vscode", () => ({
	workspace: {
		asRelativePath: vi.fn((path: string) => path.replace("/test/", "")),
	},
}))

describe("codebaseSearchTool", () => {
	let mockTask: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any
	let mockCodeIndexManager: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup mock task
		mockTask = {
			cwd: "/test/workspace",
			consecutiveMistakeCount: 0,
			providerRef: {
				deref: vi.fn().mockReturnValue({
					context: {},
				}),
			},
			ask: vi.fn(),
			say: vi.fn(),
			sayAndCreateMissingParamError: vi.fn(),
		}

		// Setup mock functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, value) => value)

		// Setup mock CodeIndexManager
		mockCodeIndexManager = {
			isFeatureEnabled: true,
			isFeatureConfigured: true,
			isInitialized: true,
			getCurrentStatus: vi.fn(),
			searchIndex: vi.fn(),
		}

		vi.mocked(CodeIndexManager.getInstance).mockReturnValue(mockCodeIndexManager)
		vi.mocked(formatResponse.toolDenied).mockReturnValue("Tool denied")
		vi.mocked(formatResponse.missingToolParameterError).mockReturnValue("Missing parameter")
	})

	describe("indexing status checks", () => {
		it("should throw error when indexing is in progress", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Indexing",
				processedItems: 50,
				totalItems: 100,
				currentItemUnit: "blocks",
			})

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act & Assert
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("Code indexing is currently in progress (50% complete)"),
				}),
			)
		})

		it("should throw error when index is in standby state", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Standby",
				processedItems: 0,
				totalItems: 0,
			})

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act & Assert
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("Code index is not ready (status: Standby)"),
				}),
			)
		})

		it("should throw error when index is in error state", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Error",
				processedItems: 0,
				totalItems: 0,
				message: "Index failed",
			})

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act & Assert
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("Code index is not ready (status: Error)"),
				}),
			)
		})

		it("should proceed with search when index is ready", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Indexed",
				processedItems: 100,
				totalItems: 100,
			})

			mockCodeIndexManager.searchIndex.mockResolvedValue([
				{
					score: 0.95,
					payload: {
						filePath: "/test/file.ts",
						startLine: 10,
						endLine: 20,
						codeChunk: "test code",
					},
				},
			])

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Mock say method to capture the result
			mockTask.say = vi.fn()

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockCodeIndexManager.searchIndex).toHaveBeenCalledWith("test query", undefined)
			expect(mockPushToolResult).toHaveBeenCalled()
			expect(mockHandleError).not.toHaveBeenCalled()

			// Verify the result was pushed with correct format
			const pushCall = mockPushToolResult.mock.calls[0][0]
			expect(pushCall).toContain("Query: test query")
			expect(pushCall).toContain("file.ts")
			expect(pushCall).toContain("Score: 0.95")
			expect(pushCall).toContain("Lines: 10-20")
			expect(pushCall).toContain("test code")
		})

		it("should calculate progress percentage correctly", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Indexing",
				processedItems: 75,
				totalItems: 150,
				currentItemUnit: "files",
			})

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("50% complete"),
				}),
			)
		})

		it("should handle zero total items when calculating progress", async () => {
			// Arrange
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Indexing",
				processedItems: 0,
				totalItems: 0,
				currentItemUnit: "blocks",
			})

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockHandleError).toHaveBeenCalledWith(
				"codebase_search",
				expect.objectContaining({
					message: expect.stringContaining("0% complete"),
				}),
			)
		})
	})

	describe("existing functionality", () => {
		beforeEach(() => {
			// Set index to ready state for existing functionality tests
			mockCodeIndexManager.getCurrentStatus.mockReturnValue({
				systemStatus: "Indexed",
				processedItems: 100,
				totalItems: 100,
			})
		})

		it("should handle missing query parameter", async () => {
			// Arrange
			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {},
				partial: false,
			}

			mockTask.sayAndCreateMissingParamError.mockResolvedValue("error message")

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockTask.sayAndCreateMissingParamError).toHaveBeenCalledWith("codebase_search", "query")
			expect(mockPushToolResult).toHaveBeenCalledWith("error message")
		})

		it("should handle user denial", async () => {
			// Arrange
			mockAskApproval.mockResolvedValue(false)

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockPushToolResult).toHaveBeenCalledWith("Tool denied")
			expect(mockCodeIndexManager.searchIndex).not.toHaveBeenCalled()
		})

		it("should handle empty search results", async () => {
			// Arrange
			mockCodeIndexManager.searchIndex.mockResolvedValue([])

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
				},
				partial: false,
			}

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockPushToolResult).toHaveBeenCalledWith(
				'No relevant code snippets found for the query: "test query"',
			)
		})

		it("should handle search with directory prefix", async () => {
			// Arrange
			mockCodeIndexManager.searchIndex.mockResolvedValue([])

			const block = {
				type: "tool_use" as const,
				name: "codebase_search" as const,
				params: {
					query: "test query",
					path: "src/components",
				},
				partial: false,
			}

			// Act
			await codebaseSearchTool(
				mockTask,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Assert
			expect(mockCodeIndexManager.searchIndex).toHaveBeenCalledWith("test query", "src/components")
		})
	})
})
