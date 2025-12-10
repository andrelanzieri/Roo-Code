// npx vitest run core/assistant-message/__tests__/NativeToolCallParser.tool-aliasing.spec.ts

import { NativeToolCallParser } from "../NativeToolCallParser"

describe("NativeToolCallParser Tool Aliasing", () => {
	beforeEach(() => {
		// Clear any existing reverse map before each test
		NativeToolCallParser.clearToolAliasReverseMap()
	})

	afterEach(() => {
		// Clean up after each test
		NativeToolCallParser.clearToolAliasReverseMap()
	})

	describe("setToolAliasReverseMap", () => {
		it("should store the reverse map", () => {
			const reverseMap = new Map([
				["edit_file", "apply_diff"],
				["create_file", "write_to_file"],
			])

			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			// Verify by resolving names
			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("apply_diff")
			expect(NativeToolCallParser.resolveOriginalToolName("create_file")).toBe("write_to_file")
		})

		it("should overwrite existing map", () => {
			const firstMap = new Map([["edit_file", "apply_diff"]])
			const secondMap = new Map([["new_alias", "original_name"]])

			NativeToolCallParser.setToolAliasReverseMap(firstMap)
			NativeToolCallParser.setToolAliasReverseMap(secondMap)

			// First map should no longer be effective
			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("edit_file")
			// Second map should be effective
			expect(NativeToolCallParser.resolveOriginalToolName("new_alias")).toBe("original_name")
		})
	})

	describe("clearToolAliasReverseMap", () => {
		it("should clear the reverse map", () => {
			const reverseMap = new Map([["edit_file", "apply_diff"]])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			// Verify it works
			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("apply_diff")

			// Clear and verify it's gone
			NativeToolCallParser.clearToolAliasReverseMap()
			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("edit_file")
		})
	})

	describe("resolveOriginalToolName", () => {
		it("should return original name for aliased tool", () => {
			const reverseMap = new Map([["edit_file", "apply_diff"]])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("apply_diff")
		})

		it("should resolve both presented and original names", () => {
			const reverseMap = new Map([["edit", "apply_diff"]])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			const result = NativeToolCallParser.resolveToolNames("edit")
			expect(result.original).toBe("apply_diff")
			expect(result.presented).toBe("edit")
		})

		it("should return same name if not in reverse map", () => {
			const reverseMap = new Map([["edit_file", "apply_diff"]])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			expect(NativeToolCallParser.resolveOriginalToolName("read_file")).toBe("read_file")
		})

		it("should return same name when reverse map is empty", () => {
			expect(NativeToolCallParser.resolveOriginalToolName("apply_diff")).toBe("apply_diff")
		})

		it("should handle multiple aliased tools", () => {
			const reverseMap = new Map([
				["edit_file", "apply_diff"],
				["create_file", "write_to_file"],
				["view_file", "read_file"],
			])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)

			expect(NativeToolCallParser.resolveOriginalToolName("edit_file")).toBe("apply_diff")
			expect(NativeToolCallParser.resolveOriginalToolName("create_file")).toBe("write_to_file")
			expect(NativeToolCallParser.resolveOriginalToolName("view_file")).toBe("read_file")
			expect(NativeToolCallParser.resolveOriginalToolName("list_files")).toBe("list_files") // Not aliased
		})
	})

	describe("parseToolCall with aliased tools", () => {
		beforeEach(() => {
			// Set up a reverse map for testing
			const reverseMap = new Map([
				["edit_file", "apply_diff"],
				["create_file", "write_to_file"],
			])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)
		})

		it("should resolve aliased tool back to original name", () => {
			const toolCall = {
				id: "test-id-1",
				name: "edit_file" as any, // Model calls it "edit_file"
				arguments: JSON.stringify({ path: "test.ts", diff: "some diff content" }),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).not.toBeNull()
			expect(result!.type).toBe("tool_use")
			// The resolved name should be the original "apply_diff"
			if (result!.type === "tool_use") {
				expect(result!.name).toBe("apply_diff")
			}
		})

		it("should parse non-aliased tools normally", () => {
			const toolCall = {
				id: "test-id-2",
				name: "read_file" as any,
				arguments: JSON.stringify({
					files: [{ path: "test.ts" }],
				}),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).not.toBeNull()
			expect(result!.type).toBe("tool_use")
			if (result!.type === "tool_use") {
				expect(result!.name).toBe("read_file") // Still "read_file", not aliased
			}
		})

		it("should preserve tool arguments when resolving aliased tool", () => {
			const toolCall = {
				id: "test-id-3",
				name: "edit_file" as any,
				arguments: JSON.stringify({
					path: "src/test.ts",
					diff: "<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE",
				}),
			}

			const result = NativeToolCallParser.parseToolCall(toolCall)

			expect(result).not.toBeNull()
			if (result!.type === "tool_use") {
				expect(result!.name).toBe("apply_diff")
				expect(result!.nativeArgs).toEqual({
					path: "src/test.ts",
					diff: "<<<<<<< SEARCH\nold\n=======\nnew\n>>>>>>> REPLACE",
				})
			}
		})
	})

	describe("processStreamingChunk with aliased tools", () => {
		beforeEach(() => {
			// Set up a reverse map for testing
			const reverseMap = new Map([
				["edit_file", "apply_diff"],
				["edit", "apply_diff"],
				["create_file", "write_to_file"],
			])
			NativeToolCallParser.setToolAliasReverseMap(reverseMap)
			NativeToolCallParser.clearAllStreamingToolCalls()
		})

		afterEach(() => {
			NativeToolCallParser.clearAllStreamingToolCalls()
		})

		it("should resolve aliased tool in streaming chunks", () => {
			// Start streaming with aliased tool name
			NativeToolCallParser.startStreamingToolCall("stream-1", "edit_file")

			// Process a chunk with partial arguments
			const partialResult = NativeToolCallParser.processStreamingChunk(
				"stream-1",
				'{"path": "test.ts", "diff": "some diff"',
			)

			// The result should have the original tool name, not the aliased one
			expect(partialResult).not.toBeNull()
			if (partialResult) {
				expect(partialResult.name).toBe("apply_diff") // Resolved to original name
				expect(partialResult.partial).toBe(true)
			}
		})

		it("should resolve short aliased tool names in streaming chunks", () => {
			// Start streaming with a very short aliased tool name like "edit"
			NativeToolCallParser.startStreamingToolCall("stream-2", "edit")

			// Process a chunk with partial arguments
			const partialResult = NativeToolCallParser.processStreamingChunk(
				"stream-2",
				'{"path": "file.ts", "diff": "x"}',
			)

			// The result should have the original tool name
			expect(partialResult).not.toBeNull()
			if (partialResult) {
				expect(partialResult.name).toBe("apply_diff") // Resolved to original name
				expect(partialResult.nativeArgs).toEqual({
					path: "file.ts",
					diff: "x",
				})
			}
		})

		it("should handle non-aliased tools in streaming", () => {
			// Start streaming with a non-aliased tool
			NativeToolCallParser.startStreamingToolCall("stream-3", "read_file")

			// Process a chunk
			const partialResult = NativeToolCallParser.processStreamingChunk(
				"stream-3",
				'{"files": [{"path": "test.ts"}]}',
			)

			// The result should keep the original name
			expect(partialResult).not.toBeNull()
			if (partialResult) {
				expect(partialResult.name).toBe("read_file")
			}
		})

		it("should finalize streaming tool call with resolved name", () => {
			// Start streaming with aliased tool name
			NativeToolCallParser.startStreamingToolCall("stream-4", "edit_file")

			// Process some chunks
			NativeToolCallParser.processStreamingChunk("stream-4", '{"path": "test.ts", ')
			NativeToolCallParser.processStreamingChunk("stream-4", '"diff": "complete diff"}')

			// Finalize
			const finalResult = NativeToolCallParser.finalizeStreamingToolCall("stream-4")

			expect(finalResult).not.toBeNull()
			if (finalResult && finalResult.type === "tool_use") {
				expect(finalResult.name).toBe("apply_diff") // Resolved to original name
				expect(finalResult.partial).toBe(false)
			}
		})
	})
})
