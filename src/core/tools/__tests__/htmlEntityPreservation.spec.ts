import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "fs/promises"
import { applyDiffToolLegacy } from "../applyDiffTool"
import { applyDiffTool } from "../multiApplyDiffTool"
import { writeToFileTool } from "../writeToFileTool"
import { searchAndReplaceTool } from "../searchAndReplaceTool"
import { ToolUse } from "../../../shared/tools"

// Mock dependencies
vi.mock("fs/promises")
vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(true),
}))
vi.mock("../../../utils/path", () => ({
	getReadablePath: vi.fn((cwd, path) => path),
}))
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg) => `Error: ${msg}`),
		rooIgnoreError: vi.fn((path) => `Access denied: ${path}`),
		createPrettyPatch: vi.fn(() => "mock-diff"),
	},
}))
vi.mock("../../../integrations/editor/detect-omission", () => ({
	detectCodeOmission: vi.fn().mockReturnValue(false),
}))
vi.mock("../../../utils/pathUtils", () => ({
	isPathOutsideWorkspace: vi.fn().mockReturnValue(false),
}))
vi.mock("../../../integrations/misc/extract-text", () => ({
	everyLineHasLineNumbers: vi.fn().mockReturnValue(false),
	stripLineNumbers: vi.fn((content) => content),
}))
vi.mock("delay", () => ({
	default: vi.fn(),
}))

describe("HTML Entity Preservation", () => {
	const testContent = `
		<div>
			<p>This &amp; that</p>
			<span>&lt;important&gt;</span>
			<code>if (a &lt; b &amp;&amp; c &gt; d) { return &quot;test&quot;; }</code>
		</div>
	`

	const mockCline: any = {
		cwd: "/test",
		consecutiveMistakeCount: 0,
		consecutiveMistakeCountForApplyDiff: new Map(),
		didEditFile: false,
		api: {
			getModel: vi.fn().mockReturnValue({ id: "gpt-4" }),
		},
		providerRef: {
			deref: vi.fn().mockReturnValue({
				getState: vi.fn().mockResolvedValue({
					diagnosticsEnabled: true,
					writeDelayMs: 0,
					experiments: {},
				}),
			}),
		},
		rooIgnoreController: {
			validateAccess: vi.fn().mockReturnValue(true),
		},
		rooProtectedController: {
			isWriteProtected: vi.fn().mockReturnValue(false),
		},
		diffViewProvider: {
			editType: "modify",
			originalContent: testContent,
			open: vi.fn(),
			update: vi.fn(),
			reset: vi.fn(),
			revertChanges: vi.fn(),
			saveChanges: vi.fn().mockResolvedValue({
				newProblemsMessage: "",
				userEdits: null,
				finalContent: testContent,
			}),
			saveDirectly: vi.fn(),
			scrollToFirstDiff: vi.fn(),
			pushToolWriteResult: vi.fn().mockResolvedValue("Success"),
		},
		diffStrategy: {
			applyDiff: vi.fn().mockImplementation((original, diff) => ({
				success: true,
				content: testContent,
			})),
			getProgressStatus: vi.fn(),
		},
		fileContextTracker: {
			trackFileContext: vi.fn(),
		},
		say: vi.fn(),
		ask: vi.fn(),
		recordToolError: vi.fn(),
		sayAndCreateMissingParamError: vi.fn(),
		processQueuedMessages: vi.fn(),
	}

	const mockAskApproval = vi.fn().mockResolvedValue(true)
	const mockHandleError = vi.fn()
	const mockPushToolResult = vi.fn()
	const mockRemoveClosingTag = vi.fn((tag, content) => content)

	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(fs.readFile).mockResolvedValue(testContent)
	})

	describe("applyDiffTool", () => {
		it("should preserve HTML entities in diff content", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "apply_diff",
				params: {
					path: "test.html",
					diff: `<<<<<<< SEARCH
<p>This & that</p>
=======
<p>This &amp; that</p>
>>>>>>> REPLACE`,
				},
				partial: false,
			}

			await applyDiffToolLegacy(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify that the diff content was passed to diffStrategy without modification
			expect(mockCline.diffStrategy.applyDiff).toHaveBeenCalledWith(
				testContent,
				expect.stringContaining("&amp;"),
				expect.any(Number),
			)
		})
	})

	describe("multiApplyDiffTool", () => {
		it("should preserve HTML entities in multi-file diff operations", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "apply_diff",
				params: {
					args: `<file>
						<path>test.html</path>
						<diff>
							<content><<<<<<< SEARCH
<code>if (a < b && c > d) { return "test"; }</code>
=======
<code>if (a &lt; b &amp;&amp; c &gt; d) { return &quot;test&quot;; }</code>
>>>>>>> REPLACE</content>
						</diff>
					</file>`,
				},
				partial: false,
			}

			await applyDiffTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify that HTML entities were preserved in the diff items
			expect(mockCline.diffStrategy.applyDiff).toHaveBeenCalledWith(
				testContent,
				expect.arrayContaining([
					expect.objectContaining({
						content: expect.stringContaining("&lt;"),
					}),
				]),
			)
		})
	})

	describe("writeToFileTool", () => {
		it("should preserve HTML entities when writing files", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "write_to_file",
				params: {
					path: "test.html",
					content: testContent,
					line_count: "7",
				},
				partial: false,
			}

			await writeToFileTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify that content with HTML entities was passed unchanged
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expect.stringContaining("&amp;"), true)
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expect.stringContaining("&lt;"), true)
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expect.stringContaining("&gt;"), true)
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(expect.stringContaining("&quot;"), true)
		})

		it("should preserve HTML entities for both Claude and non-Claude models", async () => {
			const htmlContent = '<p>&lt;Hello &amp; "World"&gt;</p>'
			const block: ToolUse = {
				type: "tool_use",
				name: "write_to_file",
				params: {
					path: "test.html",
					content: htmlContent,
					line_count: "1",
				},
				partial: false,
			}

			// Test with non-Claude model
			mockCline.api.getModel.mockReturnValue({ id: "gpt-4" })
			await writeToFileTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(htmlContent, true)

			// Clear mocks and test with Claude model
			vi.clearAllMocks()
			mockCline.api.getModel.mockReturnValue({ id: "claude-3-opus" })
			await writeToFileTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)
			expect(mockCline.diffViewProvider.update).toHaveBeenCalledWith(htmlContent, true)
		})
	})

	describe("searchAndReplaceTool", () => {
		it("should preserve HTML entities in search and replace operations", async () => {
			const block: ToolUse = {
				type: "tool_use",
				name: "search_and_replace",
				params: {
					path: "test.html",
					search: "This & that",
					replace: "This &amp; that",
					use_regex: "false",
					ignore_case: "false",
				},
				partial: false,
			}

			await searchAndReplaceTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify that the search and replace preserved HTML entities
			expect(mockCline.diffViewProvider.update).toHaveBeenCalled()
			// The tool should have been called with the original search/replace values
			expect(block.params.search).toBe("This & that")
			expect(block.params.replace).toBe("This &amp; that")
		})
	})

	describe("Integration test", () => {
		it("should handle complex HTML with multiple entities correctly", async () => {
			const complexHtml = `
				<!DOCTYPE html>
				<html>
				<head>
					<title>Test &amp; Demo</title>
					<meta content="width=device-width, initial-scale=1" name="viewport">
				</head>
				<body>
					<h1>Comparison: 5 &lt; 10 &amp;&amp; 10 &gt; 5</h1>
					<p>Quote: &quot;Hello, World!&quot;</p>
					<p>Apostrophe: It&apos;s working!</p>
					<code>
						if (x &lt; y &amp;&amp; y &gt; z) {
							console.log(&quot;Condition met&quot;);
						}
					</code>
				</body>
				</html>
			`

			const block: ToolUse = {
				type: "tool_use",
				name: "write_to_file",
				params: {
					path: "complex.html",
					content: complexHtml,
					line_count: "18",
				},
				partial: false,
			}

			await writeToFileTool(
				mockCline,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			// Verify all entities are preserved
			const calledContent = mockCline.diffViewProvider.update.mock.calls[0][0]
			expect(calledContent).toContain("&amp;")
			expect(calledContent).toContain("&lt;")
			expect(calledContent).toContain("&gt;")
			expect(calledContent).toContain("&quot;")
			expect(calledContent).toContain("&apos;")

			// Ensure no unescaping happened
			expect(calledContent).not.toContain("&&")
			expect(calledContent).not.toContain("< 10 &&")
			expect(calledContent).not.toContain("> 5")
		})
	})
})
