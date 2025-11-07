import { describe, it, expect } from "vitest"
import { flattenMessages, formatContentBlockToMarkdown } from "../export-markdown"
import { Anthropic } from "@anthropic-ai/sdk"

describe("export-markdown", () => {
	describe("flattenMessages", () => {
		it("should handle Orchestrator completion messages correctly", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "user",
					content: "Test task",
				},
				{
					role: "assistant",
					content: "Orchestrator: Task completed successfully",
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(2)
			expect(result[1]).toEqual({
				role: "assistant",
				content: "Orchestrator: Task completed successfully",
			})
		})

		it("should flatten tool_result blocks with array content", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_result",
							tool_use_id: "test-id",
							content: [
								{ type: "text", text: "Line 1" },
								{ type: "text", text: "Line 2" },
							],
						},
					],
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(1)
			expect(result[0].content).toBeInstanceOf(Array)
			const content = result[0].content as Anthropic.ContentBlock[]
			expect(content[0].type).toBe("tool_result")
			const toolResult = content[0] as unknown as Anthropic.ToolResultBlockParam
			expect(typeof toolResult.content).toBe("string")
			expect(toolResult.content).toBe("Line 1\nLine 2")
		})

		it("should pass through regular messages unchanged", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "user",
					content: "Hello",
				},
				{
					role: "assistant",
					content: "Hi there",
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(2)
			expect(result[0]).toEqual(messages[0])
			expect(result[1]).toEqual(messages[1])
		})

		it("should handle non-Orchestrator assistant messages", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "assistant",
					content: "Regular assistant response",
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				role: "assistant",
				content: "Regular assistant response",
			})
		})

		it("should handle tool_use blocks in array content", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "test-id",
							name: "test_tool",
							input: { arg: "value" },
						},
					],
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(1)
			expect(result[0].content).toBeInstanceOf(Array)
			const content = result[0].content as Anthropic.ContentBlock[]
			expect(content[0].type).toBe("tool_use")
			const toolUse = content[0] as Anthropic.ToolUseBlockParam
			expect(toolUse.name).toBe("test_tool")
		})

		it("should handle tool_result with string content", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_result",
							tool_use_id: "test-id",
							content: "Simple string result",
						},
					],
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(1)
			expect(result[0].content).toBeInstanceOf(Array)
			const content = result[0].content as Anthropic.ContentBlock[]
			expect(content[0].type).toBe("tool_result")
			const toolResult = content[0] as unknown as Anthropic.ToolResultBlockParam
			expect(toolResult.content).toBe("Simple string result")
		})

		it("should handle mixed content types in array", () => {
			const messages: Anthropic.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Some text" },
						{
							type: "tool_result",
							tool_use_id: "test-id",
							content: [
								{ type: "text", text: "Result 1" },
								{ type: "text", text: "Result 2" },
							],
						},
						{ type: "text", text: "More text" },
					],
				},
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(1)
			expect(result[0].content).toBeInstanceOf(Array)
			const content = result[0].content as Anthropic.ContentBlock[]
			expect(content).toHaveLength(3)
			expect(content[0].type).toBe("text")
			expect(content[1].type).toBe("tool_result")
			const toolResult = content[1] as unknown as Anthropic.ToolResultBlockParam
			expect(typeof toolResult.content).toBe("string")
			expect(content[2].type).toBe("text")
		})

		it("should handle empty messages array", () => {
			const messages: Anthropic.MessageParam[] = []

			const result = flattenMessages(messages)

			expect(result).toHaveLength(0)
		})

		it("should preserve message order", () => {
			const messages: Anthropic.MessageParam[] = [
				{ role: "user", content: "Message 1" },
				{ role: "assistant", content: "Message 2" },
				{ role: "user", content: "Message 3" },
				{ role: "assistant", content: "Orchestrator: Task completed" },
				{ role: "user", content: "Message 5" },
			]

			const result = flattenMessages(messages)

			expect(result).toHaveLength(5)
			expect((result[0] as any).content).toBe("Message 1")
			expect((result[1] as any).content).toBe("Message 2")
			expect((result[2] as any).content).toBe("Message 3")
			expect((result[3] as any).content).toBe("Orchestrator: Task completed")
			expect((result[4] as any).content).toBe("Message 5")
		})
	})

	describe("formatContentBlockToMarkdown", () => {
		it("should format text blocks", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "text",
				text: "Hello world",
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toBe("Hello world")
		})

		it("should format image blocks", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "image",
				source: {
					type: "base64",
					media_type: "image/png",
					data: "base64data",
				},
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toBe("[Image]")
		})

		it("should format tool_use blocks with object input", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "tool_use",
				id: "test-id",
				name: "test_tool",
				input: {
					path: "/test/path",
					content: "test content",
				},
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toContain("[Tool Use: test_tool]")
			expect(result).toContain("Path: /test/path")
			expect(result).toContain("Content: test content")
		})

		it("should format tool_use blocks with string input", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "tool_use",
				id: "test-id",
				name: "test_tool",
				input: "simple string input",
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toBe("[Tool Use: test_tool]\nsimple string input")
		})

		it("should format tool_result blocks with string content", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "tool_result",
				tool_use_id: "test-id",
				content: "Tool result",
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toBe("[Tool]\nTool result")
		})

		it("should format tool_result blocks with error flag", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "tool_result",
				tool_use_id: "test-id",
				content: "Error occurred",
				is_error: true,
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toBe("[Tool (Error)]\nError occurred")
		})

		it("should format tool_result blocks with array content", () => {
			const block: Anthropic.Messages.ContentBlockParam = {
				type: "tool_result",
				tool_use_id: "test-id",
				content: [
					{ type: "text", text: "Part 1" },
					{ type: "text", text: "Part 2" },
				],
			}

			const result = formatContentBlockToMarkdown(block)

			expect(result).toContain("[Tool]")
			expect(result).toContain("Part 1")
			expect(result).toContain("Part 2")
		})
	})
})
