import { describe, it, expect } from "vitest"
import { getNativeTools } from "../index"

// Helper to extract tool names
function getToolNames(tools: ReturnType<typeof getNativeTools>): string[] {
	return tools.map((t) => ("function" in t ? t.function.name : ""))
}

// Helper to find a tool by name
function findTool(tools: ReturnType<typeof getNativeTools>, name: string) {
	return tools.find((t) => "function" in t && t.function.name === name)
}

describe("getNativeTools", () => {
	it("should include codebase_search when codebaseSearchEnabled is true", () => {
		const tools = getNativeTools(true, true)
		const toolNames = getToolNames(tools)
		expect(toolNames).toContain("codebase_search")
	})

	it("should exclude codebase_search when codebaseSearchEnabled is false", () => {
		const tools = getNativeTools(true, false)
		const toolNames = getToolNames(tools)
		expect(toolNames).not.toContain("codebase_search")
	})

	it("should include codebase_search by default (codebaseSearchEnabled defaults to true)", () => {
		const tools = getNativeTools(true)
		const toolNames = getToolNames(tools)
		expect(toolNames).toContain("codebase_search")
	})

	it("should include read_file with line_ranges when partialReadsEnabled is true", () => {
		const tools = getNativeTools(true, true)
		const readFileTool = findTool(tools, "read_file")
		expect(readFileTool).toBeDefined()
		if (readFileTool && "function" in readFileTool) {
			expect(readFileTool.function.description).toContain("line_ranges")
		}
	})

	it("should include read_file without line_ranges when partialReadsEnabled is false", () => {
		const tools = getNativeTools(false, true)
		const readFileTool = findTool(tools, "read_file")
		expect(readFileTool).toBeDefined()
		if (readFileTool && "function" in readFileTool) {
			expect(readFileTool.function.description).not.toContain("line_ranges")
		}
	})

	it("should always include core tools regardless of settings", () => {
		const tools = getNativeTools(true, true)
		const toolNames = getToolNames(tools)
		expect(toolNames).toContain("read_file")
		expect(toolNames).toContain("write_to_file")
		expect(toolNames).toContain("execute_command")
		expect(toolNames).toContain("apply_diff")
		expect(toolNames).toContain("ask_followup_question")
		expect(toolNames).toContain("attempt_completion")
	})
})
