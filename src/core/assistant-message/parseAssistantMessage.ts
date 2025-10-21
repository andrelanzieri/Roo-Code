import { type ToolName, toolNames } from "@roo-code/types"

import { TextContent, ToolUse, ToolParamName, toolParamNames } from "../../shared/tools"

export type AssistantMessageContent = TextContent | ToolUse

export function parseAssistantMessage(assistantMessage: string): AssistantMessageContent[] {
	let contentBlocks: AssistantMessageContent[] = []
	let currentTextContent: TextContent | undefined = undefined
	let currentTextContentStartIndex = 0
	let currentToolUse: ToolUse | undefined = undefined
	let currentToolUseStartIndex = 0
	let currentParamName: ToolParamName | undefined = undefined
	let currentParamValueStartIndex = 0
	let parameterNestingDepth = 0
	let accumulator = ""
	let inFunctionCalls = false

	for (let i = 0; i < assistantMessage.length; i++) {
		const char = assistantMessage[i]
		accumulator += char

		// Inside function_calls block, handle parameters (check this FIRST to avoid nested tag issues)
		if (currentToolUse && currentParamName) {
			const currentParamValue = accumulator.slice(currentParamValueStartIndex)

			// Check for nested <parameter> opening tags within param value
			if (currentParamValue.endsWith('<parameter name="')) {
				parameterNestingDepth++
			}

			// Check for </parameter> closing tag
			const paramClosingTag = `</parameter>`
			if (currentParamValue.endsWith(paramClosingTag)) {
				if (parameterNestingDepth > 0) {
					// This is a nested closing tag, decrement depth and continue
					parameterNestingDepth--
					continue
				}
				// This is the actual closing tag for our parameter
				const paramValue = currentParamValue.slice(0, -paramClosingTag.length)
				currentToolUse.params[currentParamName] =
					currentParamName === "content"
						? paramValue.replace(/^\n/, "").replace(/\n$/, "")
						: paramValue.trim()
				currentParamName = undefined
				parameterNestingDepth = 0
				continue
			} else {
				// Partial param value is accumulating
				continue
			}
		}

		// Check for <function_calls> opening tag (only if not in a parameter)
		if (!inFunctionCalls && !currentParamName && accumulator.endsWith("<function_calls>")) {
			inFunctionCalls = true

			// End current text content if exists
			if (currentTextContent) {
				currentTextContent.partial = false
				currentTextContent.content = accumulator
					.slice(currentTextContentStartIndex, accumulator.length - "<function_calls>".length)
					.trim()
				if (currentTextContent.content.length > 0) {
					contentBlocks.push(currentTextContent)
				}
				currentTextContent = undefined
			}
			currentTextContentStartIndex = accumulator.length
			continue
		}

		// Check for </function_calls> closing tag (only if not in a parameter)
		if (inFunctionCalls && !currentParamName && accumulator.endsWith("</function_calls>")) {
			inFunctionCalls = false
			currentTextContentStartIndex = accumulator.length
			continue
		}

		// Inside function_calls, handle invoke tags
		if (inFunctionCalls) {
			// Check for </invoke> closing tag
			if (currentToolUse && accumulator.endsWith("</invoke>")) {
				// Special case for write_to_file content parameter
				const contentParamName: ToolParamName = "content"
				if (currentToolUse.name === "write_to_file") {
					const toolContent = accumulator.slice(
						currentToolUseStartIndex,
						accumulator.length - "</invoke>".length,
					)
					const contentStartTag = `<parameter name="${contentParamName}">`
					const contentEndTag = `</parameter>`
					const contentStartIndex = toolContent.indexOf(contentStartTag)
					const contentEndIndex = toolContent.lastIndexOf(contentEndTag)

					if (contentStartIndex !== -1 && contentEndIndex !== -1 && contentEndIndex > contentStartIndex) {
						const contentValue = toolContent
							.slice(contentStartIndex + contentStartTag.length, contentEndIndex)
							.replace(/^\n/, "")
							.replace(/\n$/, "")
						currentToolUse.params[contentParamName] = contentValue
					}
				}

				// End of tool use
				currentToolUse.partial = false
				contentBlocks.push(currentToolUse)
				currentToolUse = undefined
				continue
			}

			// Check for <parameter name="..."> opening tag
			if (currentToolUse && !currentParamName) {
				const match = accumulator.match(/<parameter name="([^"]+)">$/)
				if (match) {
					const paramName = match[1]
					if (toolParamNames.includes(paramName as ToolParamName)) {
						currentParamName = paramName as ToolParamName
						currentParamValueStartIndex = accumulator.length
						parameterNestingDepth = 0
					}
					continue
				}
			}

			// Check for <invoke name="..."> opening tag
			if (!currentToolUse) {
				const match = accumulator.match(/<invoke name="([^"]+)">$/)
				if (match) {
					const toolName = match[1]
					if (toolNames.includes(toolName as ToolName)) {
						currentToolUse = {
							type: "tool_use",
							name: toolName as ToolName,
							params: {},
							partial: true,
						}
						currentToolUseStartIndex = accumulator.length
					}
					continue
				}
			}
		}

		// Outside function_calls, handle text content
		if (!inFunctionCalls && !currentToolUse) {
			if (currentTextContent === undefined) {
				currentTextContentStartIndex = i
			}

			currentTextContent = {
				type: "text",
				content: accumulator.slice(currentTextContentStartIndex).trim(),
				partial: true,
			}
		}
	}

	if (currentToolUse) {
		// Stream did not complete tool call, add it as partial
		if (currentParamName) {
			// Tool call has a parameter that was not completed
			const paramValue = accumulator.slice(currentParamValueStartIndex)
			currentToolUse.params[currentParamName] =
				currentParamName === "content" ? paramValue.replace(/^\n/, "").replace(/\n$/, "") : paramValue.trim()
		}

		contentBlocks.push(currentToolUse)
	}

	// NOTE: It doesn't matter if check for currentToolUse or
	// currentTextContent, only one of them will be defined since only one can
	// be partial at a time.
	if (currentTextContent) {
		// Stream did not complete text content, add it as partial
		contentBlocks.push(currentTextContent)
	}

	return contentBlocks
}
