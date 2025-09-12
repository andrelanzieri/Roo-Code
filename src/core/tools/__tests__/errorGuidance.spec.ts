import { describe, it, expect } from "vitest"
import { ToolErrorGuidance, ToolErrorPattern, GuidanceContext } from "../errorGuidance"

describe("ToolErrorGuidance", () => {
	describe("getContextualGuidance", () => {
		it("should return generic guidance when no error patterns are provided", () => {
			const context: GuidanceContext = {
				recentTools: [],
				errorPatterns: [],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(result).toHaveLength(3)
			expect(result[0]).toContain("Try breaking down the task")
		})

		it("should detect file not found errors", () => {
			const context: GuidanceContext = {
				recentTools: ["read_file", "read_file"],
				errorPatterns: [
					{
						toolName: "read_file",
						errorType: "file_not_found",
						count: 2,
						lastError: "File not found: src/test.ts",
					},
				],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			// Check for file operation guidance
			expect(result.some((s: string) => s.toLowerCase().includes("file") || s.includes("'list_files'"))).toBe(
				true,
			)
		})

		it("should detect missing parameter errors", () => {
			const context: GuidanceContext = {
				recentTools: ["write_to_file", "apply_diff"],
				errorPatterns: [
					{
						toolName: "write_to_file",
						errorType: "missing_param",
						count: 1,
						lastError: "Missing required parameter: content",
					},
					{
						toolName: "apply_diff",
						errorType: "missing_param",
						count: 1,
						lastError: "Required parameter path is missing",
					},
				],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			// Should return some guidance
			expect(result).toBeTruthy()
			expect(result.length).toBeGreaterThan(0)
			expect(result.length).toBeLessThanOrEqual(3)
		})

		it("should detect permission errors", () => {
			const context: GuidanceContext = {
				recentTools: ["write_to_file", "execute_command"],
				errorPatterns: [
					{
						toolName: "write_to_file",
						errorType: "permission_denied",
						count: 1,
						lastError: "Permission denied",
					},
					{
						toolName: "execute_command",
						errorType: "permission_denied",
						count: 1,
						lastError: "Access denied",
					},
				],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			// Should return some guidance
			expect(result).toBeTruthy()
			expect(result.length).toBeGreaterThan(0)
			expect(result.length).toBeLessThanOrEqual(3)
		})

		it("should detect repeated failures", () => {
			const context: GuidanceContext = {
				recentTools: ["read_file", "read_file", "read_file", "read_file", "read_file"],
				errorPatterns: [
					{
						toolName: "read_file",
						errorType: "repeated_failure",
						count: 5,
						lastError: "Some error",
					},
				],
				consecutiveMistakeCount: 5,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(result.some((s: string) => s.includes("breaking down the task"))).toBe(true)
		})

		it("should detect search operation issues", () => {
			const context: GuidanceContext = {
				recentTools: ["search_files", "list_files", "search_files"],
				errorPatterns: [],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(result.some((s: string) => s.includes("search patterns") || s.includes("project structure"))).toBe(
				true,
			)
		})

		it("should detect code modification issues", () => {
			const context: GuidanceContext = {
				recentTools: ["apply_diff", "write_to_file", "apply_diff"],
				errorPatterns: [],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(
				result.some(
					(s: string) => s.includes("Read the file first") || s.includes("smaller, targeted changes"),
				),
			).toBe(true)
		})

		it("should limit suggestions to 3", () => {
			const context: GuidanceContext = {
				recentTools: [
					"read_file",
					"write_to_file",
					"apply_diff",
					"execute_command",
					"search_files",
					"list_files",
				],
				errorPatterns: [
					{
						toolName: "read_file",
						errorType: "file_not_found",
						count: 2,
						lastError: "File not found",
					},
					{
						toolName: "write_to_file",
						errorType: "permission_denied",
						count: 1,
						lastError: "Permission denied",
					},
					{
						toolName: "apply_diff",
						errorType: "missing_param",
						count: 1,
						lastError: "Missing parameter",
					},
				],
				consecutiveMistakeCount: 5,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(result.length).toBeLessThanOrEqual(3)
		})

		it("should handle mixed error patterns", () => {
			const context: GuidanceContext = {
				recentTools: ["read_file", "write_to_file", "apply_diff"],
				errorPatterns: [
					{
						toolName: "read_file",
						errorType: "file_not_found",
						count: 1,
						lastError: "File not found: config.json",
					},
					{
						toolName: "write_to_file",
						errorType: "permission_denied",
						count: 1,
						lastError: "Permission denied",
					},
				],
				consecutiveMistakeCount: 3,
			}

			const result = ToolErrorGuidance.getContextualGuidance(context)

			expect(result).toBeTruthy()
			expect(result.length).toBeGreaterThan(0)
			expect(result.length).toBeLessThanOrEqual(3)
		})
	})

	describe("formatGuidanceMessage", () => {
		it("should format guidance messages properly", () => {
			const guidance = [
				"Try breaking down the task into smaller steps",
				"Use list_files to verify directory structure",
			]

			const result = ToolErrorGuidance.formatGuidanceMessage(guidance)

			expect(result).toContain("struggling with tool usage")
			expect(result).toContain("1.")
			expect(result).toContain("2.")
		})

		it("should return default message for empty guidance", () => {
			const result = ToolErrorGuidance.formatGuidanceMessage([])

			expect(result).toContain("failure in the model's thought process")
		})
	})

	describe("buildErrorPatterns", () => {
		it("should correctly identify file not found pattern", () => {
			const recentTools = ["read_file" as any]
			const toolErrors = new Map([["read_file" as any, { count: 1, lastError: "ENOENT: no such file" }]])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(1)
			expect(patterns[0].errorType).toBe("file_not_found")
			expect(patterns[0].count).toBe(1)
		})

		it("should correctly identify missing parameter pattern", () => {
			const recentTools = ["write_to_file" as any]
			const toolErrors = new Map([
				["write_to_file" as any, { count: 1, lastError: "Missing required parameter: content" }],
			])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(1)
			expect(patterns[0].errorType).toBe("missing_param")
		})

		it("should correctly identify permission denied pattern", () => {
			const recentTools = ["execute_command" as any]
			const toolErrors = new Map([["execute_command" as any, { count: 1, lastError: "permission denied" }]])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(1)
			expect(patterns[0].errorType).toBe("permission_denied")
		})

		it("should correctly identify invalid format pattern", () => {
			const recentTools = ["write_to_file" as any]
			const toolErrors = new Map([["write_to_file" as any, { count: 1, lastError: "Invalid JSON format" }]])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(1)
			expect(patterns[0].errorType).toBe("invalid_format")
		})

		it("should default to repeated_failure for unknown errors", () => {
			const recentTools = ["read_file" as any]
			const toolErrors = new Map([["read_file" as any, { count: 3, lastError: "Unknown error" }]])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(1)
			expect(patterns[0].errorType).toBe("repeated_failure")
			expect(patterns[0].count).toBe(3)
		})

		it("should handle multiple tools with errors", () => {
			const recentTools = ["read_file" as any, "write_to_file" as any, "apply_diff" as any]
			const toolErrors = new Map([
				["read_file" as any, { count: 2, lastError: "File not found" }],
				["write_to_file" as any, { count: 1, lastError: "Permission denied" }],
				["apply_diff" as any, { count: 1, lastError: "Missing required parameter" }],
			])

			const patterns = ToolErrorGuidance.buildErrorPatterns(recentTools, toolErrors)

			expect(patterns).toHaveLength(3)
			expect(patterns.find((p) => p.toolName === "read_file")?.errorType).toBe("file_not_found")
			expect(patterns.find((p) => p.toolName === "write_to_file")?.errorType).toBe("permission_denied")
			expect(patterns.find((p) => p.toolName === "apply_diff")?.errorType).toBe("missing_param")
		})
	})
})
