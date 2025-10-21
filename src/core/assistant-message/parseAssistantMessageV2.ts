import { type ToolName, toolNames } from "@roo-code/types"

import { TextContent, ToolUse, ToolParamName, toolParamNames } from "../../shared/tools"

export type AssistantMessageContent = TextContent | ToolUse

/**
 * Parses an assistant message string potentially containing mixed text and tool
 * usage blocks marked with XML-like tags into an array of structured content
 * objects.
 *
 * Supports the new format:
 * <function_calls>
 *   <invoke name="tool_name">
 *     <parameter name="param_name">value</parameter>
 *   </invoke>
 * </function_calls>
 *
 * This version aims for efficiency by avoiding the character-by-character
 * accumulator of V1. It iterates through the string using an index `i`. At each
 * position, it checks if the substring *ending* at `i` matches any known
 * opening or closing tags.
 *
 * State is managed using indices pointing to the start of the current block
 * within the original `assistantMessage` string.
 *
 * Slicing is used to extract content only when a block is completed.
 *
 * Special handling for `write_to_file` content parameters is included.
 *
 * If the input string ends mid-block, the last open block is added and marked
 * as partial.
 *
 * @param assistantMessage The raw string output from the assistant.
 * @returns An array of `AssistantMessageContent` objects, which can be
 *          `TextContent` or `ToolUse`. Blocks that were not fully closed by the
 *          end of the input string will have their `partial` flag set to
 *          `true`.
 */

export function parseAssistantMessageV2(assistantMessage: string): AssistantMessageContent[] {
	const contentBlocks: AssistantMessageContent[] = []

	let currentTextContentStart = 0
	let currentTextContent: TextContent | undefined = undefined
	let currentToolUseStart = 0
	let currentToolUse: ToolUse | undefined = undefined
	let currentParamValueStart = 0
	let currentParamName: ToolParamName | undefined = undefined
	let parameterNestingDepth = 0
	let inFunctionCalls = false

	const len = assistantMessage.length

	for (let i = 0; i < len; i++) {
		const currentCharIndex = i

		// Inside function_calls block, handle parameters (check FIRST to avoid nested tag issues)
		if (currentToolUse && currentParamName) {
			// Check for nested <parameter name=" opening tags
			const paramOpenPattern = '<parameter name="'
			if (
				currentCharIndex >= paramOpenPattern.length - 1 &&
				assistantMessage.startsWith(paramOpenPattern, currentCharIndex - paramOpenPattern.length + 1)
			) {
				parameterNestingDepth++
			}

			// Check for </parameter> closing tag
			const paramCloseTag = "</parameter>"
			if (
				currentCharIndex >= paramCloseTag.length - 1 &&
				assistantMessage.startsWith(paramCloseTag, currentCharIndex - paramCloseTag.length + 1)
			) {
				if (parameterNestingDepth > 0) {
					// This is a nested closing tag, decrement depth and continue
					parameterNestingDepth--
					continue
				}
				// This is the actual closing tag for our parameter
				const value = assistantMessage.slice(
					currentParamValueStart,
					currentCharIndex - paramCloseTag.length + 1,
				)
				currentToolUse.params[currentParamName] =
					currentParamName === "content" ? value.replace(/^\n/, "").replace(/\n$/, "") : value.trim()
				currentParamName = undefined
				parameterNestingDepth = 0
			} else {
				continue // Still inside param value
			}
		}

		// Check for <function_calls> opening tag (only if not in a parameter)
		const functionCallsOpenTag = "<function_calls>"
		if (
			!inFunctionCalls &&
			!currentParamName &&
			currentCharIndex >= functionCallsOpenTag.length - 1 &&
			assistantMessage.startsWith(functionCallsOpenTag, currentCharIndex - functionCallsOpenTag.length + 1)
		) {
			inFunctionCalls = true

			// End current text content if exists
			if (currentTextContent) {
				currentTextContent.content = assistantMessage
					.slice(currentTextContentStart, currentCharIndex - functionCallsOpenTag.length + 1)
					.trim()
				currentTextContent.partial = false
				if (currentTextContent.content.length > 0) {
					contentBlocks.push(currentTextContent)
				}
				currentTextContent = undefined
			}
			currentTextContentStart = currentCharIndex + 1
			continue
		}

		// Check for </function_calls> closing tag (only if not in a parameter)
		const functionCallsCloseTag = "</function_calls>"
		if (
			inFunctionCalls &&
			!currentParamName &&
			currentCharIndex >= functionCallsCloseTag.length - 1 &&
			assistantMessage.startsWith(functionCallsCloseTag, currentCharIndex - functionCallsCloseTag.length + 1)
		) {
			inFunctionCalls = false
			currentTextContentStart = currentCharIndex + 1
			continue
		}

		// Inside function_calls, handle invoke tags
		if (inFunctionCalls) {
			// Check for </invoke> closing tag
			const invokeCloseTag = "</invoke>"
			if (
				currentToolUse &&
				currentCharIndex >= invokeCloseTag.length - 1 &&
				assistantMessage.startsWith(invokeCloseTag, currentCharIndex - invokeCloseTag.length + 1)
			) {
				// Special case for write_to_file content parameter
				const contentParamName: ToolParamName = "content"
				if (currentToolUse.name === "write_to_file") {
					const toolContentSlice = assistantMessage.slice(
						currentToolUseStart,
						currentCharIndex - invokeCloseTag.length + 1,
					)
					const contentStartTag = `<parameter name="${contentParamName}">`
					const contentEndTag = "</parameter>"
					const contentStart = toolContentSlice.indexOf(contentStartTag)
					const contentEnd = toolContentSlice.lastIndexOf(contentEndTag)

					if (contentStart !== -1 && contentEnd !== -1 && contentEnd > contentStart) {
						const contentValue = toolContentSlice
							.slice(contentStart + contentStartTag.length, contentEnd)
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
				const paramMatch = assistantMessage
					.slice(Math.max(0, currentCharIndex - 50), currentCharIndex + 1)
					.match(/<parameter name="([^"]+)">$/)
				if (paramMatch) {
					const paramName = paramMatch[1]
					if (toolParamNames.includes(paramName as ToolParamName)) {
						currentParamName = paramName as ToolParamName
						currentParamValueStart = currentCharIndex + 1
						parameterNestingDepth = 0
					}
					continue
				}
			}

			// Check for <invoke name="..."> opening tag
			if (!currentToolUse) {
				const invokeMatch = assistantMessage
					.slice(Math.max(0, currentCharIndex - 50), currentCharIndex + 1)
					.match(/<invoke name="([^"]+)">$/)
				if (invokeMatch) {
					const toolName = invokeMatch[1]
					if (toolNames.includes(toolName as ToolName)) {
						currentToolUse = {
							type: "tool_use",
							name: toolName as ToolName,
							params: {},
							partial: true,
						}
						currentToolUseStart = currentCharIndex + 1
					}
					continue
				}
			}
		}

		// Outside function_calls, handle text content
		if (!inFunctionCalls && !currentToolUse) {
			if (!currentTextContent) {
				currentTextContentStart = currentCharIndex
				currentTextContent = {
					type: "text",
					content: "",
					partial: true,
				}
			}
		}
	}

	// Finalize any open parameter within an open tool use.
	if (currentToolUse && currentParamName) {
		const value = assistantMessage.slice(currentParamValueStart) // From param start to end of string.
		// Don't trim content parameters to preserve newlines, but strip first and last newline only
		currentToolUse.params[currentParamName] =
			currentParamName === "content" ? value.replace(/^\n/, "").replace(/\n$/, "") : value.trim()
		// Tool use remains partial.
	}

	// Finalize any open tool use (which might contain the finalized partial param).
	if (currentToolUse) {
		// Tool use is partial because the loop finished before its closing tag.
		contentBlocks.push(currentToolUse)
	}
	// Finalize any trailing text content.
	// Only possible if a tool use wasn't open at the very end.
	else if (currentTextContent) {
		currentTextContent.content = assistantMessage
			.slice(currentTextContentStart) // From text start to end of string.
			.trim()

		// Text is partial because the loop finished.
		if (currentTextContent.content.length > 0) {
			contentBlocks.push(currentTextContent)
		}
	}

	return contentBlocks
}
