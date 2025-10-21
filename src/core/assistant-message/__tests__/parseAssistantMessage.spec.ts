// npx vitest src/core/assistant-message/__tests__/parseAssistantMessage.spec.ts

import { TextContent, ToolUse } from "../../../shared/tools"

import { AssistantMessageContent, parseAssistantMessage as parseAssistantMessageV1 } from "../parseAssistantMessage"
import { parseAssistantMessageV2 } from "../parseAssistantMessageV2"

const isEmptyTextContent = (block: AssistantMessageContent) =>
	block.type === "text" && (block as TextContent).content === ""

;[parseAssistantMessageV1, parseAssistantMessageV2].forEach((parser, index) => {
	describe(`parseAssistantMessageV${index + 1}`, () => {
		describe("text content parsing", () => {
			it("should parse a simple text message", () => {
				const message = "This is a simple text message"
				const result = parser(message)

				expect(result).toHaveLength(1)
				expect(result[0]).toEqual({
					type: "text",
					content: message,
					partial: true, // Text is always partial when it's the last content
				})
			})

			it("should parse a multi-line text message", () => {
				const message = "This is a multi-line\ntext message\nwith several lines"
				const result = parser(message)

				expect(result).toHaveLength(1)
				expect(result[0]).toEqual({
					type: "text",
					content: message,
					partial: true, // Text is always partial when it's the last content
				})
			})

			it("should mark text as partial when it's the last content in the message", () => {
				const message = "This is a partial text"
				const result = parser(message)

				expect(result).toHaveLength(1)
				expect(result[0]).toEqual({
					type: "text",
					content: message,
					partial: true,
				})
			})
		})

		describe("tool use parsing", () => {
			it("should parse a simple tool use", () => {
				const message =
					'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.partial).toBe(false)
			})

			it("should parse a tool use with multiple parameters", () => {
				const message =
					'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter><parameter name="start_line">10</parameter><parameter name="end_line">20</parameter></invoke></function_calls>'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.params.start_line).toBe("10")
				expect(toolUse.params.end_line).toBe("20")
				expect(toolUse.partial).toBe(false)
			})

			it("should mark tool use as partial when it's not closed", () => {
				const message =
					'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter>'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.partial).toBe(true)
			})

			it("should handle a partial parameter in a tool use", () => {
				const message = '<function_calls><invoke name="read_file"><parameter name="path">src/file.ts'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.partial).toBe(true)
			})
		})

		describe("mixed content parsing", () => {
			it("should parse text followed by a tool use", () => {
				const message =
					'Here\'s the file content: <function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>'
				const result = parser(message)

				expect(result).toHaveLength(2)

				const textContent = result[0] as TextContent
				expect(textContent.type).toBe("text")
				expect(textContent.content).toBe("Here's the file content:")
				expect(textContent.partial).toBe(false)

				const toolUse = result[1] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.partial).toBe(false)
			})

			it("should parse a tool use followed by text", () => {
				const message =
					'<function_calls><invoke name="read_file"><parameter name="path">src/file.ts</parameter></invoke></function_calls>Here\'s what I found in the file.'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(2)

				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("read_file")
				expect(toolUse.params.path).toBe("src/file.ts")
				expect(toolUse.partial).toBe(false)

				const textContent = result[1] as TextContent
				expect(textContent.type).toBe("text")
				expect(textContent.content).toBe("Here's what I found in the file.")
				expect(textContent.partial).toBe(true)
			})

			it("should parse multiple tool uses separated by text", () => {
				const message =
					'First file: <function_calls><invoke name="read_file"><parameter name="path">src/file1.ts</parameter></invoke></function_calls>Second file: <function_calls><invoke name="read_file"><parameter name="path">src/file2.ts</parameter></invoke></function_calls>'
				const result = parser(message)

				expect(result).toHaveLength(4)

				expect(result[0].type).toBe("text")
				expect((result[0] as TextContent).content).toBe("First file:")

				expect(result[1].type).toBe("tool_use")
				expect((result[1] as ToolUse).name).toBe("read_file")
				expect((result[1] as ToolUse).params.path).toBe("src/file1.ts")

				expect(result[2].type).toBe("text")
				expect((result[2] as TextContent).content).toBe("Second file:")

				expect(result[3].type).toBe("tool_use")
				expect((result[3] as ToolUse).name).toBe("read_file")
				expect((result[3] as ToolUse).params.path).toBe("src/file2.ts")
			})
		})

		describe("special cases", () => {
			it("should handle the write_to_file tool with content that contains closing tags", () => {
				const message = `<function_calls><invoke name="write_to_file"><parameter name="path">src/file.ts</parameter><parameter name="content">
	function example() {
	// This has XML-like content: </parameter>
	return true;
	}
	</parameter><parameter name="line_count">5</parameter></invoke></function_calls>`

				const result = parser(message).filter((block) => !isEmptyTextContent(block))

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
				const result = parser(message)

				expect(result).toHaveLength(0)
			})

			it("should handle malformed tool use tags", () => {
				const message = "This has a <not_a_tool>malformed tag</not_a_tool>"
				const result = parser(message)

				expect(result).toHaveLength(1)
				expect(result[0].type).toBe("text")
				expect((result[0] as TextContent).content).toBe(message)
			})

			it("should handle tool use with no parameters", () => {
				const message = '<function_calls><invoke name="browser_action"></invoke></function_calls>'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("browser_action")
				expect(Object.keys(toolUse.params).length).toBe(0)
				expect(toolUse.partial).toBe(false)
			})

			it("should handle nested tool tags that aren't actually nested", () => {
				const message =
					'<function_calls><invoke name="execute_command"><parameter name="command">echo \'<function_calls><invoke name="read_file"><parameter name="path">test.txt</parameter></invoke></function_calls>\'</parameter></invoke></function_calls>'

				const result = parser(message).filter((block) => !isEmptyTextContent(block))

				expect(result).toHaveLength(1)
				const toolUse = result[0] as ToolUse
				expect(toolUse.type).toBe("tool_use")
				expect(toolUse.name).toBe("execute_command")
				expect(toolUse.params.command).toBe(
					'echo \'<function_calls><invoke name="read_file"><parameter name="path">test.txt</parameter></invoke></function_calls>\'',
				)
				expect(toolUse.partial).toBe(false)
			})

			it("should handle a tool use with a parameter containing XML-like content", () => {
				const message =
					'<function_calls><invoke name="search_files"><parameter name="regex"><div>.*</div></parameter><parameter name="path">src</parameter></invoke></function_calls>'
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

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
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

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
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

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
				const result = parser(message).filter((block) => !isEmptyTextContent(block))

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

				const result = parser(message)

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
	})
})
