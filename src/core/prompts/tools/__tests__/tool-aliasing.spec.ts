// npx vitest run core/prompts/tools/__tests__/tool-aliasing.spec.ts

import type OpenAI from "openai"
import { parseToolAliases, createReverseAliasMap, applyToolAliases } from "../filter-tools-for-mode"

// End-to-end test for order-independent behavior
describe("Tool Aliasing Order Independence", () => {
	const createMockTool = (name: string): OpenAI.Chat.ChatCompletionTool => ({
		type: "function",
		function: {
			name,
			description: `Mock ${name} tool`,
			parameters: { type: "object", properties: {}, required: [] },
		},
	})

	const mockTools: OpenAI.Chat.ChatCompletionTool[] = [
		createMockTool("apply_diff"),
		createMockTool("write_to_file"),
		createMockTool("read_file"),
	]

	it("should alias to short names (e.g., edit)", () => {
		const aliasMap = parseToolAliases(["apply_diff:edit"])
		const reverseMap = createReverseAliasMap(aliasMap)
		const aliasedTools = applyToolAliases(mockTools, aliasMap)

		expect(aliasMap.get("apply_diff")).toBe("edit")
		expect(reverseMap.get("edit")).toBe("apply_diff")

		const toolNames = aliasedTools.map((t: OpenAI.Chat.ChatCompletionTool) =>
			t.type === "function" ? t.function.name : "",
		)
		expect(toolNames).toContain("edit")
		expect(toolNames).not.toContain("apply_diff")
	})

	it("should alias both tools regardless of order in config (order 1)", () => {
		const toolAliasesConfig = ["write_to_file:write_file", "apply_diff:replace"]
		const aliasMap = parseToolAliases(toolAliasesConfig)
		const reverseMap = createReverseAliasMap(aliasMap)
		const aliasedTools = applyToolAliases(mockTools, aliasMap)

		// Check alias map has both
		expect(aliasMap.size).toBe(2)
		expect(aliasMap.get("write_to_file")).toBe("write_file")
		expect(aliasMap.get("apply_diff")).toBe("replace")

		// Check reverse map has both
		expect(reverseMap.size).toBe(2)
		expect(reverseMap.get("write_file")).toBe("write_to_file")
		expect(reverseMap.get("replace")).toBe("apply_diff")

		// Check tools are aliased
		const toolNames = aliasedTools.map((t: OpenAI.Chat.ChatCompletionTool) =>
			t.type === "function" ? t.function.name : "",
		)
		expect(toolNames).toContain("write_file")
		expect(toolNames).toContain("replace")
		expect(toolNames).toContain("read_file") // Not aliased
		expect(toolNames).not.toContain("write_to_file")
		expect(toolNames).not.toContain("apply_diff")
	})

	it("should alias both tools regardless of order in config (order 2)", () => {
		const toolAliasesConfig = ["apply_diff:replace", "write_to_file:write_file"]
		const aliasMap = parseToolAliases(toolAliasesConfig)
		const reverseMap = createReverseAliasMap(aliasMap)
		const aliasedTools = applyToolAliases(mockTools, aliasMap)

		// Check alias map has both
		expect(aliasMap.size).toBe(2)
		expect(aliasMap.get("apply_diff")).toBe("replace")
		expect(aliasMap.get("write_to_file")).toBe("write_file")

		// Check reverse map has both
		expect(reverseMap.size).toBe(2)
		expect(reverseMap.get("replace")).toBe("apply_diff")
		expect(reverseMap.get("write_file")).toBe("write_to_file")

		// Check tools are aliased
		const toolNames = aliasedTools.map((t: OpenAI.Chat.ChatCompletionTool) =>
			t.type === "function" ? t.function.name : "",
		)
		expect(toolNames).toContain("replace")
		expect(toolNames).toContain("write_file")
		expect(toolNames).toContain("read_file") // Not aliased
		expect(toolNames).not.toContain("apply_diff")
		expect(toolNames).not.toContain("write_to_file")
	})
})

/**
 * Helper to get function name from a ChatCompletionTool
 */
function getFunctionName(tool: OpenAI.Chat.ChatCompletionTool): string {
	if ("function" in tool && tool.function) {
		return tool.function.name
	}
	throw new Error("Tool does not have function property")
}

/**
 * Helper to get function description from a ChatCompletionTool
 */
function getFunctionDescription(tool: OpenAI.Chat.ChatCompletionTool): string | undefined {
	if ("function" in tool && tool.function) {
		return tool.function.description
	}
	throw new Error("Tool does not have function property")
}

/**
 * Helper to get function parameters from a ChatCompletionTool
 */
function getFunctionParameters(tool: OpenAI.Chat.ChatCompletionTool): OpenAI.FunctionParameters | undefined {
	if ("function" in tool && tool.function) {
		return tool.function.parameters
	}
	throw new Error("Tool does not have function property")
}

describe("Tool Aliasing", () => {
	describe("parseToolAliases", () => {
		it("should return empty map for undefined input", () => {
			const result = parseToolAliases(undefined)
			expect(result.size).toBe(0)
		})

		it("should return empty map for empty array", () => {
			const result = parseToolAliases([])
			expect(result.size).toBe(0)
		})

		it("should parse single alias specification", () => {
			const result = parseToolAliases(["apply_diff:edit_file"])
			expect(result.size).toBe(1)
			expect(result.get("apply_diff")).toBe("edit_file")
		})

		it("should parse multiple alias specifications", () => {
			const result = parseToolAliases(["apply_diff:edit_file", "write_to_file:create_file"])
			expect(result.size).toBe(2)
			expect(result.get("apply_diff")).toBe("edit_file")
			expect(result.get("write_to_file")).toBe("create_file")
		})

		it("should ignore invalid specs without colon", () => {
			const result = parseToolAliases(["apply_diff", "valid:alias"])
			expect(result.size).toBe(1)
			expect(result.get("valid")).toBe("alias")
		})

		it("should ignore specs with colon at start", () => {
			const result = parseToolAliases([":alias_name"])
			expect(result.size).toBe(0)
		})

		it("should ignore specs with colon at end", () => {
			const result = parseToolAliases(["original_name:"])
			expect(result.size).toBe(0)
		})

		it("should handle tool names with underscores", () => {
			const result = parseToolAliases(["my_long_tool_name:short_name"])
			expect(result.size).toBe(1)
			expect(result.get("my_long_tool_name")).toBe("short_name")
		})

		it("should handle alias names with multiple colons (only first colon is delimiter)", () => {
			const result = parseToolAliases(["original:name:with:colons"])
			expect(result.size).toBe(1)
			expect(result.get("original")).toBe("name:with:colons")
		})
	})

	describe("createReverseAliasMap", () => {
		it("should create empty map from empty input", () => {
			const aliasMap = new Map<string, string>()
			const result = createReverseAliasMap(aliasMap)
			expect(result.size).toBe(0)
		})

		it("should reverse single mapping", () => {
			const aliasMap = new Map([["apply_diff", "edit_file"]])
			const result = createReverseAliasMap(aliasMap)
			expect(result.size).toBe(1)
			expect(result.get("edit_file")).toBe("apply_diff")
		})

		it("should reverse multiple mappings", () => {
			const aliasMap = new Map([
				["apply_diff", "edit_file"],
				["write_to_file", "create_file"],
			])
			const result = createReverseAliasMap(aliasMap)
			expect(result.size).toBe(2)
			expect(result.get("edit_file")).toBe("apply_diff")
			expect(result.get("create_file")).toBe("write_to_file")
		})
	})

	describe("applyToolAliases", () => {
		const createMockTool = (name: string): OpenAI.Chat.ChatCompletionTool => ({
			type: "function",
			function: {
				name,
				description: `Mock ${name} tool`,
				parameters: {
					type: "object",
					properties: {},
				},
			},
		})

		it("should return original tools when alias map is empty", () => {
			const tools = [createMockTool("apply_diff"), createMockTool("read_file")]
			const aliasMap = new Map<string, string>()
			const result = applyToolAliases(tools, aliasMap)

			expect(result).toEqual(tools)
			expect(getFunctionName(result[0])).toBe("apply_diff")
			expect(getFunctionName(result[1])).toBe("read_file")
		})

		it("should alias a single tool", () => {
			const tools = [createMockTool("apply_diff"), createMockTool("read_file")]
			const aliasMap = new Map([["apply_diff", "edit_file"]])
			const result = applyToolAliases(tools, aliasMap)

			expect(getFunctionName(result[0])).toBe("edit_file")
			expect(getFunctionName(result[1])).toBe("read_file")
		})

		it("should alias multiple tools", () => {
			const tools = [createMockTool("apply_diff"), createMockTool("write_to_file"), createMockTool("read_file")]
			const aliasMap = new Map([
				["apply_diff", "edit_file"],
				["write_to_file", "create_file"],
			])
			const result = applyToolAliases(tools, aliasMap)

			expect(getFunctionName(result[0])).toBe("edit_file")
			expect(getFunctionName(result[1])).toBe("create_file")
			expect(getFunctionName(result[2])).toBe("read_file")
		})

		it("should not modify tools that are not in the alias map", () => {
			const tools = [createMockTool("read_file"), createMockTool("list_files")]
			const aliasMap = new Map([["apply_diff", "edit_file"]])
			const result = applyToolAliases(tools, aliasMap)

			expect(getFunctionName(result[0])).toBe("read_file")
			expect(getFunctionName(result[1])).toBe("list_files")
		})

		it("should preserve tool description and parameters after aliasing", () => {
			const tool: OpenAI.Chat.ChatCompletionTool = {
				type: "function",
				function: {
					name: "apply_diff",
					description: "Apply a diff to a file",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string" },
							diff: { type: "string" },
						},
						required: ["path", "diff"],
					},
				},
			}
			const aliasMap = new Map([["apply_diff", "edit_file"]])
			const result = applyToolAliases([tool], aliasMap)

			expect(getFunctionName(result[0])).toBe("edit_file")
			expect(getFunctionDescription(result[0])).toBe("Apply a diff to a file")
			expect(getFunctionParameters(result[0])).toEqual(tool.function.parameters)
		})

		it("should return new array without mutating original tools", () => {
			const tools = [createMockTool("apply_diff")]
			const aliasMap = new Map([["apply_diff", "edit_file"]])
			const result = applyToolAliases(tools, aliasMap)

			// Original should be unchanged
			expect(getFunctionName(tools[0])).toBe("apply_diff")
			// Result should be aliased
			expect(getFunctionName(result[0])).toBe("edit_file")
		})
	})
})
