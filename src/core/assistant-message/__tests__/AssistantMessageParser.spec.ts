// npx vitest src/core/assistant-message/__tests__/AssistantMessageParser.spec.ts

import { AssistantMessageParser } from "../AssistantMessageParser"
import { AssistantMessageContent } from "../parseAssistantMessage"
import { TextContent, ToolUse } from "../../../shared/tools"

/**
 * Helper to filter out empty text content blocks.
 */
const isEmptyTextContent = (block: any) => block.type === "text" && (block as TextContent).content === ""

/**
 * Helper to simulate streaming by feeding the parser deterministic "random"-sized chunks (1-10 chars).
 * Uses a seeded pseudo-random number generator for deterministic chunking.
 */

// Simple linear congruential generator (LCG) for deterministic pseudo-random numbers
function createSeededRandom(seed: number) {
	let state = seed
	return {
		next: () => {
			// LCG parameters from Numerical Recipes
			state = (state * 1664525 + 1013904223) % 0x100000000
			return state / 0x100000000
		},
	}
}

function streamChunks(
	parser: AssistantMessageParser,
	message: string,
): ReturnType<AssistantMessageParser["getContentBlocks"]> {
	let result: AssistantMessageContent[] = []
	let i = 0
	const rng = createSeededRandom(42) // Fixed seed for deterministic tests
	while (i < message.length) {
		// Deterministic chunk size between 1 and 10, but not exceeding message length
		const chunkSize = Math.min(message.length - i, Math.floor(rng.next() * 10) + 1)
		const chunk = message.slice(i, i + chunkSize)
		result = parser.processChunk(chunk)
		i += chunkSize
	}
	return result
}

describe("AssistantMessageParser (streaming)", () => {
	let parser: AssistantMessageParser

	beforeEach(() => {
		parser = new AssistantMessageParser()
	})

	describe("text content streaming", () => {
		it("should accumulate a simple text message chunk by chunk", () => {
			const message = "Hello, this is a test."
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				type: "text",
				content: message,
				partial: true,
			})
		})

		it("should accumulate multi-line text message chunk by chunk", () => {
			const message = "Line 1\nLine 2\nLine 3"
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({
				type: "text",
				content: message,
				partial: true,
			})
		})
	})

	describe("tool use streaming", () => {
		it("should parse a tool use with parameter, streamed char by char", () => {
			const message =
				'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.partial).toBe(false)
		})

		it("should mark tool use as partial when not closed", () => {
			const message = '<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.partial).toBe(true)
		})

		it("should handle a partial parameter in a tool use", () => {
			const message = '<function_calls><invoke name="read_file"><parameter name="path">src/file'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file")
			expect(toolUse.partial).toBe(true)
		})

		it("should handle tool use with multiple parameters streamed", () => {
			const message =
				'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter><parameter name="start_line">10</parameter><parameter name="end_line">20</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.params.start_line).toBe("10")
			expect(toolUse.params.end_line).toBe("20")
			expect(toolUse.partial).toBe(false)
		})
	})

	describe("mixed content streaming", () => {
		it("should parse text followed by a tool use, streamed", () => {
			const message =
				'Text before tool <function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(2)
			const textContent = result[0] as TextContent
			expect(textContent.type).toBe("text")
			expect(textContent.content).toBe("Text before tool")
			expect(textContent.partial).toBe(false)
			const toolUse = result[1] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.partial).toBe(false)
		})

		it("should parse a tool use followed by text, streamed", () => {
			const message =
				'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>Text after tool'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(2)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.partial).toBe(false)
			const textContent = result[1] as TextContent
			expect(textContent.type).toBe("text")
			expect(textContent.content).toBe("Text after tool")
			expect(textContent.partial).toBe(true)
		})

		it("should parse multiple tool uses separated by text, streamed", () => {
			const message =
				'First: <function_calls><invoke name="read_file"><parameter name="path">file1.ts</parameter></invoke></function_calls>Second: <function_calls><invoke name="read_file"><parameter name="path">file2.ts</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(4)
			expect(result[0].type).toBe("text")
			expect((result[0] as TextContent).content).toBe("First:")
			expect(result[1].type).toBe("tool_use")
			expect((result[1] as ToolUse).name).toBe("read_file")
			expect((result[1] as ToolUse).params.path).toBe("file1.ts")
			expect(result[2].type).toBe("text")
			expect((result[2] as TextContent).content).toBe("Second:")
			expect(result[3].type).toBe("tool_use")
			expect((result[3] as ToolUse).name).toBe("read_file")
			expect((result[3] as ToolUse).params.path).toBe("file2.ts")
		})
	})

	describe("special and edge cases", () => {
		it("should handle the write_to_file tool with content that contains closing tags", () => {
			const message = `<function_calls><invoke name="write_to_file"><parameter name="path">src/file.ts</parameter><parameter name="content">
	function example() {
	// This has XML-like content: </parameter>
	return true;
	}
	</parameter><parameter name="line_count">5</parameter></invoke></function_calls>`

			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("write_to_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.params.line_count).toBe("5")
			expect(toolUse.params.content).toContain("function example()")
			expect(toolUse.params.content).toContain("// This has XML-like content: </parameter>")
			expect(toolUse.params.content).toContain("return true;")
			expect(toolUse.partial).toBe(false)
		})
		it("should handle empty messages", () => {
			const message = ""
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(0)
		})

		it("should handle malformed tool use tags as plain text", () => {
			const message = "This has a <not_a_tool>malformed tag</not_a_tool>"
			const result = streamChunks(parser, message)
			expect(result).toHaveLength(1)
			expect(result[0].type).toBe("text")
			expect((result[0] as TextContent).content).toBe(message)
		})

		it("should handle tool use with no parameters", () => {
			const message = '<function_calls><invoke name="browser_action"></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("browser_action")
			expect(Object.keys(toolUse.params).length).toBe(0)
			expect(toolUse.partial).toBe(false)
		})

		it("should handle a tool use with a parameter containing XML-like content", () => {
			const message =
				'<function_calls><invoke name="search_files"><parameter name="regex"><div>.*</div></parameter><parameter name="path">src</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("search_files")
			expect(toolUse.params.regex).toBe("<div>.*</div>")
			expect(toolUse.params.path).toBe("src")
			expect(toolUse.partial).toBe(false)
		})

		it("should handle consecutive tool uses without text in between", () => {
			const message =
				'<function_calls><invoke name="read_file"><parameter name="path">file1.ts</parameter></invoke></function_calls><function_calls><invoke name="read_file"><parameter name="path">file2.ts</parameter></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(2)
			const toolUse1 = result[0] as ToolUse
			expect(toolUse1.type).toBe("tool_use")
			expect(toolUse1.name).toBe("read_file")
			expect(toolUse1.params.path).toBe("file1.ts")
			expect(toolUse1.partial).toBe(false)
			const toolUse2 = result[1] as ToolUse
			expect(toolUse2.type).toBe("tool_use")
			expect(toolUse2.name).toBe("read_file")
			expect(toolUse2.params.path).toBe("file2.ts")
			expect(toolUse2.partial).toBe(false)
		})

		it("should handle whitespace in parameters", () => {
			const message =
				'<function_calls><invoke name="read_file"><parameter name="path">  src/file.ts  </parameter></invoke></function_calls>'
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))
			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("read_file")
			expect(toolUse.params.path).toBe("src/file.ts")
			expect(toolUse.partial).toBe(false)
		})

		it("should handle multi-line parameters", () => {
			const message = `<function_calls><invoke name="write_to_file"><parameter name="path">file.ts</parameter><parameter name="content">
	line 1
	line 2
	line 3
	</parameter><parameter name="line_count">3</parameter></invoke></function_calls>`
			const result = streamChunks(parser, message).filter((block) => !isEmptyTextContent(block))

			expect(result).toHaveLength(1)
			const toolUse = result[0] as ToolUse
			expect(toolUse.type).toBe("tool_use")
			expect(toolUse.name).toBe("write_to_file")
			expect(toolUse.params.path).toBe("file.ts")
			expect(toolUse.params.content).toContain("line 1")
			expect(toolUse.params.content).toContain("line 2")
			expect(toolUse.params.content).toContain("line 3")
			expect(toolUse.params.line_count).toBe("3")
			expect(toolUse.partial).toBe(false)
		})
		it("should handle a complex message with multiple content types", () => {
			const message = `I'll help you with that task.

	<function_calls><invoke name="read_file"><parameter name="path">src/index.ts</parameter></invoke></function_calls>

	Now let's modify the file:

	<function_calls><invoke name="write_to_file"><parameter name="path">src/index.ts</parameter><parameter name="content">
	// Updated content
	console.log("Hello world");
	</parameter><parameter name="line_count">2</parameter></invoke></function_calls>

	Let's run the code:

	<function_calls><invoke name="execute_command"><parameter name="command">node src/index.ts</parameter></invoke></function_calls>`

			const result = streamChunks(parser, message)

			expect(result).toHaveLength(6)

			// First text block
			expect(result[0].type).toBe("text")
			expect((result[0] as TextContent).content).toBe("I'll help you with that task.")

			// First tool use (read_file)
			expect(result[1].type).toBe("tool_use")
			expect((result[1] as ToolUse).name).toBe("read_file")

			// Second text block
			expect(result[2].type).toBe("text")
			expect((result[2] as TextContent).content).toContain("Now let's modify the file:")

			// Second tool use (write_to_file)
			expect(result[3].type).toBe("tool_use")
			expect((result[3] as ToolUse).name).toBe("write_to_file")

			// Third text block
			expect(result[4].type).toBe("text")
			expect((result[4] as TextContent).content).toContain("Let's run the code:")

			// Third tool use (execute_command)
			expect(result[5].type).toBe("tool_use")
			expect((result[5] as ToolUse).name).toBe("execute_command")
		})
	})

	describe("size limit handling", () => {
		it("should throw an error when MAX_ACCUMULATOR_SIZE is exceeded", () => {
			// Create a message that exceeds 1MB (MAX_ACCUMULATOR_SIZE)
			const largeMessage = "x".repeat(1024 * 1024 + 1) // 1MB + 1 byte

			expect(() => {
				parser.processChunk(largeMessage)
			}).toThrow("Assistant message exceeds maximum allowed size")
		})

		it("should gracefully handle a parameter that exceeds MAX_PARAM_LENGTH", () => {
			// Create a parameter value that exceeds 100KB (MAX_PARAM_LENGTH)
			const largeParamValue = "x".repeat(1024 * 100 + 1) // 100KB + 1 byte
			const message = `<function_calls><invoke name="write_to_file"><parameter name="path">test.txt</parameter><parameter name="content">${largeParamValue}</parameter></invoke></function_calls>After tool`

			// Process the message in chunks to simulate streaming
			let result: AssistantMessageContent[] = []
			let error: Error | null = null

			try {
				// Process the opening tags
				result = parser.processChunk(
					'<function_calls><invoke name="write_to_file"><parameter name="path">test.txt</parameter><parameter name="content">',
				)

				// Process the large parameter value in chunks
				const chunkSize = 1000
				for (let i = 0; i < largeParamValue.length; i += chunkSize) {
					const chunk = largeParamValue.slice(i, i + chunkSize)
					result = parser.processChunk(chunk)
				}

				// Process the closing tags and text after
				result = parser.processChunk("</parameter></invoke></function_calls>After tool")
			} catch (e) {
				error = e as Error
			}

			// Should not throw an error
			expect(error).toBeNull()

			// Should have processed the content
			expect(result.length).toBeGreaterThan(0)

			// The tool use should exist but the content parameter should be reset/empty
			const toolUse = result.find((block) => block.type === "tool_use") as ToolUse
			expect(toolUse).toBeDefined()
			expect(toolUse.name).toBe("write_to_file")
			expect(toolUse.params.path).toBe("test.txt")

			// The text after the tool should still be parsed
			const textAfter = result.find(
				(block) => block.type === "text" && (block as TextContent).content.includes("After tool"),
			)
			expect(textAfter).toBeDefined()
		})
	})

	describe("finalizeContentBlocks", () => {
		it("should mark all partial blocks as complete", () => {
			const message = '<function_calls><invoke name="read_file"><parameter name="path">src/file.ts'
			streamChunks(parser, message)
			let blocks = parser.getContentBlocks()
			// The block may already be partial or not, depending on chunking.
			// To ensure the test is robust, we only assert after finalizeContentBlocks.
			parser.finalizeContentBlocks()
			blocks = parser.getContentBlocks()
			expect(blocks[0].partial).toBe(false)
		})
	})
})
