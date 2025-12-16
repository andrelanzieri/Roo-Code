// npx vitest run api/transform/__tests__/r1-format.spec.ts

import { convertToR1Format } from "../r1-format"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

describe("convertToR1Format", () => {
	it("should convert basic text messages", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there" },
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "user", content: "Hello" },
			{ role: "assistant", content: "Hi there" },
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	it("should merge consecutive messages with same role", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "Hello" },
			{ role: "user", content: "How are you?" },
			{ role: "assistant", content: "Hi!" },
			{ role: "assistant", content: "I'm doing well" },
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "user", content: "Hello\nHow are you?" },
			{ role: "assistant", content: "Hi!\nI'm doing well" },
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	it("should handle image content", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64data",
						},
					},
				],
			},
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{
				role: "user",
				content: [
					{
						type: "image_url",
						image_url: {
							url: "data:image/jpeg;base64,base64data",
						},
					},
				],
			},
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	it("should handle mixed text and image content", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Check this image:" },
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "base64data",
						},
					},
				],
			},
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "Check this image:" },
					{
						type: "image_url",
						image_url: {
							url: "data:image/jpeg;base64,base64data",
						},
					},
				],
			},
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	it("should merge mixed content messages with same role", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "First image:" },
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/jpeg",
							data: "image1",
						},
					},
				],
			},
			{
				role: "user",
				content: [
					{ type: "text", text: "Second image:" },
					{
						type: "image",
						source: {
							type: "base64",
							media_type: "image/png",
							data: "image2",
						},
					},
				],
			},
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{
				role: "user",
				content: [
					{ type: "text", text: "First image:" },
					{
						type: "image_url",
						image_url: {
							url: "data:image/jpeg;base64,image1",
						},
					},
					{ type: "text", text: "Second image:" },
					{
						type: "image_url",
						image_url: {
							url: "data:image/png;base64,image2",
						},
					},
				],
			},
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	it("should handle empty messages array", () => {
		expect(convertToR1Format([])).toEqual([])
	})

	it("should handle messages with empty content", () => {
		const input: Anthropic.Messages.MessageParam[] = [
			{ role: "user", content: "" },
			{ role: "assistant", content: "" },
		]

		const expected: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "user", content: "" },
			{ role: "assistant", content: "" },
		]

		expect(convertToR1Format(input)).toEqual(expected)
	})

	// Tool handling tests
	describe("tool_use handling", () => {
		it("should convert tool_use blocks to tool_calls in assistant messages", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Read the file" },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "I'll read the file for you." },
						{
							type: "tool_use",
							id: "toolu_123",
							name: "read_file",
							input: { path: "test.txt" },
						},
					],
				},
			]

			const result = convertToR1Format(input)

			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ role: "user", content: "Read the file" })

			const assistantMsg = result[1] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantMsg.role).toBe("assistant")
			expect(assistantMsg.content).toBe("I'll read the file for you.")
			expect(assistantMsg.tool_calls).toEqual([
				{
					id: "toolu_123",
					type: "function",
					function: {
						name: "read_file",
						arguments: JSON.stringify({ path: "test.txt" }),
					},
				},
			])
		})

		it("should convert multiple tool_use blocks to multiple tool_calls", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_1",
							name: "read_file",
							input: { path: "file1.txt" },
						},
						{
							type: "tool_use",
							id: "toolu_2",
							name: "read_file",
							input: { path: "file2.txt" },
						},
					],
				},
			]

			const result = convertToR1Format(input)
			const assistantMsg = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam

			expect(assistantMsg.tool_calls).toHaveLength(2)
			expect(assistantMsg.tool_calls![0].id).toBe("toolu_1")
			expect(assistantMsg.tool_calls![1].id).toBe("toolu_2")
		})

		it("should handle assistant message with only tool_use (no text)", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_123",
							name: "update_todo_list",
							input: { todos: "[ ] Task 1\n[ ] Task 2" },
						},
					],
				},
			]

			const result = convertToR1Format(input)
			const assistantMsg = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam

			expect(assistantMsg.role).toBe("assistant")
			expect(assistantMsg.content).toBeNull()
			expect(assistantMsg.tool_calls).toHaveLength(1)
			expect((assistantMsg.tool_calls![0] as any).function.name).toBe("update_todo_list")
		})
	})

	describe("tool_result handling", () => {
		it("should convert tool_result blocks to tool messages", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_123",
							content: "File contents here",
						},
					],
				},
			]

			const result = convertToR1Format(input)

			expect(result).toHaveLength(1)
			const toolMsg = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMsg.role).toBe("tool")
			expect(toolMsg.tool_call_id).toBe("toolu_123")
			expect(toolMsg.content).toBe("File contents here")
		})

		it("should convert multiple tool_result blocks to multiple tool messages", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_1",
							content: "Result 1",
						},
						{
							type: "tool_result",
							tool_use_id: "toolu_2",
							content: "Result 2",
						},
					],
				},
			]

			const result = convertToR1Format(input)

			expect(result).toHaveLength(2)
			expect((result[0] as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id).toBe("toolu_1")
			expect((result[1] as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id).toBe("toolu_2")
		})

		it("should handle tool_result with array content", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_123",
							content: [
								{ type: "text", text: "Line 1" },
								{ type: "text", text: "Line 2" },
							],
						},
					],
				},
			]

			const result = convertToR1Format(input)
			const toolMsg = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam

			expect(toolMsg.content).toBe("Line 1\nLine 2")
		})

		it("should handle mixed tool_result and text content in user message", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_123",
							content: "Tool result",
						},
						{
							type: "text",
							text: "User feedback",
						},
					],
				},
			]

			const result = convertToR1Format(input)

			// Tool result should come first, then user message
			expect(result).toHaveLength(2)
			expect(result[0].role).toBe("tool")
			expect((result[0] as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id).toBe("toolu_123")
			expect(result[1].role).toBe("user")
			expect((result[1] as OpenAI.Chat.ChatCompletionUserMessageParam).content).toBe("User feedback")
		})
	})

	describe("complete tool call flow", () => {
		it("should handle a complete tool call cycle (request -> tool_use -> tool_result -> response)", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Update my todo list" },
				{
					role: "assistant",
					content: [
						{ type: "text", text: "I'll update your todo list." },
						{
							type: "tool_use",
							id: "toolu_update_123",
							name: "update_todo_list",
							input: { todos: "[ ] Task 1\n[x] Task 2" },
						},
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_update_123",
							content: "Todo list updated successfully.",
						},
					],
				},
				{ role: "assistant", content: "Your todo list has been updated!" },
			]

			const result = convertToR1Format(input)

			expect(result).toHaveLength(4)

			// First user message
			expect(result[0]).toEqual({ role: "user", content: "Update my todo list" })

			// Assistant with tool_calls
			const assistantWithTool = result[1] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantWithTool.role).toBe("assistant")
			expect(assistantWithTool.content).toBe("I'll update your todo list.")
			expect(assistantWithTool.tool_calls).toHaveLength(1)
			expect(assistantWithTool.tool_calls![0].id).toBe("toolu_update_123")

			// Tool result
			const toolResult = result[2] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolResult.role).toBe("tool")
			expect(toolResult.tool_call_id).toBe("toolu_update_123")
			expect(toolResult.content).toBe("Todo list updated successfully.")

			// Final assistant response
			expect(result[3]).toEqual({
				role: "assistant",
				content: "Your todo list has been updated!",
			})
		})

		it("should not merge assistant messages when tool_calls are present", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_1",
							name: "read_file",
							input: { path: "test.txt" },
						},
					],
				},
				{ role: "assistant", content: "Following up on that..." },
			]

			const result = convertToR1Format(input)

			// Should have 2 separate messages, not merged
			expect(result).toHaveLength(2)
			expect((result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam).tool_calls).toBeDefined()
			expect((result[1] as OpenAI.Chat.ChatCompletionAssistantMessageParam).tool_calls).toBeUndefined()
		})

		it("should handle multiple consecutive tool uses followed by results", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "tool_use",
							id: "toolu_1",
							name: "read_file",
							input: { path: "file1.txt" },
						},
						{
							type: "tool_use",
							id: "toolu_2",
							name: "read_file",
							input: { path: "file2.txt" },
						},
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "toolu_1",
							content: "Content of file 1",
						},
						{
							type: "tool_result",
							tool_use_id: "toolu_2",
							content: "Content of file 2",
						},
					],
				},
			]

			const result = convertToR1Format(input)

			expect(result).toHaveLength(3) // 1 assistant + 2 tool messages

			const assistantMsg = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantMsg.tool_calls).toHaveLength(2)

			expect((result[1] as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id).toBe("toolu_1")
			expect((result[2] as OpenAI.Chat.ChatCompletionToolMessageParam).tool_call_id).toBe("toolu_2")
		})
	})
})
