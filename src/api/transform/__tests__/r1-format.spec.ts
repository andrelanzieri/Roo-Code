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

	describe("tool handling", () => {
		it("should handle assistant messages with tool_use blocks", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "Let me read that file for you.",
						},
						{
							type: "tool_use",
							id: "tool-123",
							name: "read_file",
							input: { path: "/path/to/file.txt" },
						},
					],
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(1)

			const assistantMessage = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantMessage.role).toBe("assistant")
			expect(assistantMessage.content).toBe("Let me read that file for you.")
			expect(assistantMessage.tool_calls).toHaveLength(1)
			expect(assistantMessage.tool_calls![0]).toEqual({
				id: "tool-123",
				type: "function",
				function: {
					name: "read_file",
					arguments: JSON.stringify({ path: "/path/to/file.txt" }),
				},
			})
		})

		it("should handle user messages with tool_result blocks", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool-123",
							content: "File contents here",
						},
					],
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(1)

			const toolMessage = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMessage.role).toBe("tool")
			expect(toolMessage.tool_call_id).toBe("tool-123")
			expect(toolMessage.content).toBe("File contents here")
		})

		it("should handle multiple tool_use blocks in one assistant message", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll read both files.",
						},
						{
							type: "tool_use",
							id: "tool-1",
							name: "read_file",
							input: { path: "/file1.txt" },
						},
						{
							type: "tool_use",
							id: "tool-2",
							name: "read_file",
							input: { path: "/file2.txt" },
						},
					],
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(1)

			const assistantMessage = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantMessage.tool_calls).toHaveLength(2)
			expect(assistantMessage.tool_calls![0].id).toBe("tool-1")
			expect(assistantMessage.tool_calls![1].id).toBe("tool-2")
		})

		it("should handle multiple tool_result blocks in one user message", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool-1",
							content: "Content of file 1",
						},
						{
							type: "tool_result",
							tool_use_id: "tool-2",
							content: "Content of file 2",
						},
					],
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(2)

			const toolMessage1 = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMessage1.role).toBe("tool")
			expect(toolMessage1.tool_call_id).toBe("tool-1")
			expect(toolMessage1.content).toBe("Content of file 1")

			const toolMessage2 = result[1] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMessage2.role).toBe("tool")
			expect(toolMessage2.tool_call_id).toBe("tool-2")
			expect(toolMessage2.content).toBe("Content of file 2")
		})

		it("should handle full tool conversation flow", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Read the file at /test.txt" },
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "I'll read that file for you.",
						},
						{
							type: "tool_use",
							id: "tool-abc",
							name: "read_file",
							input: { path: "/test.txt" },
						},
					],
				},
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool-abc",
							content: "Hello, World!",
						},
					],
				},
				{
					role: "assistant",
					content: "The file contains: Hello, World!",
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(4)

			// First user message
			expect(result[0]).toEqual({ role: "user", content: "Read the file at /test.txt" })

			// Assistant with tool call
			const assistantWithTool = result[1] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(assistantWithTool.role).toBe("assistant")
			expect(assistantWithTool.content).toBe("I'll read that file for you.")
			expect(assistantWithTool.tool_calls).toHaveLength(1)

			// Tool result
			const toolResult = result[2] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolResult.role).toBe("tool")
			expect(toolResult.tool_call_id).toBe("tool-abc")
			expect(toolResult.content).toBe("Hello, World!")

			// Final assistant response
			expect(result[3]).toEqual({ role: "assistant", content: "The file contains: Hello, World!" })
		})

		it("should handle tool_result with array content", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool-xyz",
							content: [
								{ type: "text", text: "Line 1" },
								{ type: "text", text: "Line 2" },
							],
						},
					],
				},
			]

			const result = convertToR1Format(input)
			expect(result).toHaveLength(1)

			const toolMessage = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMessage.content).toBe("Line 1\nLine 2")
		})

		it("should handle mixed tool_result and text content in user message", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "tool_result",
							tool_use_id: "tool-123",
							content: "Tool output",
						},
						{
							type: "text",
							text: "Here's some additional context",
						},
					],
				},
			]

			const result = convertToR1Format(input)
			// Should have tool message first, then user message
			expect(result).toHaveLength(2)

			const toolMessage = result[0] as OpenAI.Chat.ChatCompletionToolMessageParam
			expect(toolMessage.role).toBe("tool")
			expect(toolMessage.content).toBe("Tool output")

			const userMessage = result[1] as OpenAI.Chat.ChatCompletionUserMessageParam
			expect(userMessage.role).toBe("user")
			expect(userMessage.content).toBe("Here's some additional context")
		})

		it("should not merge assistant messages with tool_calls", () => {
			const input: Anthropic.Messages.MessageParam[] = [
				{
					role: "assistant",
					content: [
						{
							type: "text",
							text: "First action",
						},
						{
							type: "tool_use",
							id: "tool-1",
							name: "action_1",
							input: {},
						},
					],
				},
				{
					role: "assistant",
					content: "Second message",
				},
			]

			const result = convertToR1Format(input)
			// Should NOT be merged because first message has tool_calls
			expect(result).toHaveLength(2)

			const firstAssistant = result[0] as OpenAI.Chat.ChatCompletionAssistantMessageParam
			expect(firstAssistant.tool_calls).toHaveLength(1)

			expect(result[1]).toEqual({ role: "assistant", content: "Second message" })
		})
	})
})
