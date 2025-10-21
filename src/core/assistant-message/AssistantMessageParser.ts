import { type ToolName, toolNames } from "@roo-code/types"
import { TextContent, ToolUse, ToolParamName, toolParamNames } from "../../shared/tools"
import { AssistantMessageContent } from "./parseAssistantMessage"

/**
 * Parser for assistant messages. Maintains state between chunks
 * to avoid reprocessing the entire message on each update.
 *
 * Supports the new format:
 * <function_calls>
 *   <invoke name="tool_name">
 *     <parameter name="param_name">value</parameter>
 *   </invoke>
 * </function_calls>
 */
export class AssistantMessageParser {
	private contentBlocks: AssistantMessageContent[] = []
	private currentTextContent: TextContent | undefined = undefined
	private currentTextContentStartIndex = 0
	private currentToolUse: ToolUse | undefined = undefined
	private currentToolUseStartIndex = 0
	private currentParamName: ToolParamName | undefined = undefined
	private currentParamValueStartIndex = 0
	private readonly MAX_ACCUMULATOR_SIZE = 1024 * 1024 // 1MB limit
	private readonly MAX_PARAM_LENGTH = 1024 * 100 // 100KB per parameter limit
	private accumulator = ""
	private inFunctionCalls = false

	/**
	 * Initialize a new AssistantMessageParser instance.
	 */
	constructor() {
		this.reset()
	}

	/**
	 * Reset the parser state.
	 */
	public reset(): void {
		this.contentBlocks = []
		this.currentTextContent = undefined
		this.currentTextContentStartIndex = 0
		this.currentToolUse = undefined
		this.currentToolUseStartIndex = 0
		this.currentParamName = undefined
		this.currentParamValueStartIndex = 0
		this.accumulator = ""
		this.inFunctionCalls = false
	}

	/**
	 * Returns the current parsed content blocks
	 */

	public getContentBlocks(): AssistantMessageContent[] {
		// Return a shallow copy to prevent external mutation
		return this.contentBlocks.slice()
	}
	/**
	 * Extract the name attribute from a tag like <invoke name="tool_name"> or <parameter name="param_name">
	 */
	private extractNameAttribute(tagContent: string): string | null {
		const match = tagContent.match(/name="([^"]+)"/)
		return match ? match[1] : null
	}

	/**
	 * Process a new chunk of text and update the parser state.
	 * Supports the new format: <function_calls><invoke name="tool"><parameter name="param">value</parameter></invoke></function_calls>
	 * @param chunk The new chunk of text to process.
	 */
	public processChunk(chunk: string): AssistantMessageContent[] {
		if (this.accumulator.length + chunk.length > this.MAX_ACCUMULATOR_SIZE) {
			throw new Error("Assistant message exceeds maximum allowed size")
		}
		// Store the current length of the accumulator before adding the new chunk
		const accumulatorStartLength = this.accumulator.length

		for (let i = 0; i < chunk.length; i++) {
			const char = chunk[i]
			this.accumulator += char
			const currentPosition = accumulatorStartLength + i

			// Check for <function_calls> opening tag
			if (!this.inFunctionCalls && this.accumulator.endsWith("<function_calls>")) {
				this.inFunctionCalls = true

				// End current text content if exists
				if (this.currentTextContent) {
					this.currentTextContent.partial = false
					this.currentTextContent.content = this.accumulator
						.slice(this.currentTextContentStartIndex, this.accumulator.length - "<function_calls>".length)
						.trim()
					if (this.currentTextContent.content.length > 0) {
						// No need to push, already in contentBlocks
					}
					this.currentTextContent = undefined
				}
				continue
			}

			// Check for </function_calls> closing tag
			if (this.inFunctionCalls && this.accumulator.endsWith("</function_calls>")) {
				this.inFunctionCalls = false
				this.currentTextContentStartIndex = this.accumulator.length
				continue
			}

			// Inside function_calls block, handle parameters
			if (this.currentToolUse && this.currentParamName) {
				const currentParamValue = this.accumulator.slice(this.currentParamValueStartIndex)
				if (currentParamValue.length > this.MAX_PARAM_LENGTH) {
					// Reset to a safe state
					this.currentParamName = undefined
					this.currentParamValueStartIndex = 0
					continue
				}

				const paramClosingTag = `</parameter>`
				if (currentParamValue.endsWith(paramClosingTag)) {
					// End of param value
					const paramValue = currentParamValue.slice(0, -paramClosingTag.length)
					this.currentToolUse.params[this.currentParamName] =
						this.currentParamName === "content"
							? paramValue.replace(/^\n/, "").replace(/\n$/, "")
							: paramValue.trim()
					this.currentParamName = undefined
					continue
				} else {
					// Partial param value is accumulating
					this.currentToolUse.params[this.currentParamName] = currentParamValue
					continue
				}
			}

			// Inside function_calls, handle invoke tags
			if (this.inFunctionCalls) {
				// Check for </invoke> closing tag
				if (this.currentToolUse && this.accumulator.endsWith("</invoke>")) {
					// Special case for write_to_file content parameter
					const contentParamName: ToolParamName = "content"
					if (this.currentToolUse.name === "write_to_file") {
						const toolContent = this.accumulator.slice(
							this.currentToolUseStartIndex,
							this.accumulator.length - "</invoke>".length,
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
							this.currentToolUse.params[contentParamName] = contentValue
						}
					}

					// End of tool use
					this.currentToolUse.partial = false
					this.currentToolUse = undefined
					continue
				}

				// Check for <parameter name="..."> opening tag
				if (this.currentToolUse && !this.currentParamName) {
					const paramMatch = this.accumulator.match(/<parameter name="([^"]+)">$/)
					if (paramMatch) {
						const paramName = paramMatch[1]
						if (toolParamNames.includes(paramName as ToolParamName)) {
							this.currentParamName = paramName as ToolParamName
							this.currentParamValueStartIndex = this.accumulator.length
						}
						continue
					}
				}

				// Check for <invoke name="..."> opening tag
				if (!this.currentToolUse) {
					const invokeMatch = this.accumulator.match(/<invoke name="([^"]+)">$/)
					if (invokeMatch) {
						const toolName = invokeMatch[1]
						if (toolNames.includes(toolName as ToolName)) {
							this.currentToolUse = {
								type: "tool_use",
								name: toolName as ToolName,
								params: {},
								partial: true,
							}
							this.currentToolUseStartIndex = this.accumulator.length

							// Immediately push new tool_use block as partial
							let idx = this.contentBlocks.findIndex((block) => block === this.currentToolUse)
							if (idx === -1) {
								this.contentBlocks.push(this.currentToolUse)
							}
						}
						continue
					}
				}
			}

			// Outside function_calls, handle text content
			if (!this.inFunctionCalls && !this.currentToolUse) {
				if (this.currentTextContent === undefined) {
					this.currentTextContentStartIndex = currentPosition

					this.currentTextContent = {
						type: "text",
						content: this.accumulator.slice(this.currentTextContentStartIndex).trim(),
						partial: true,
					}

					this.contentBlocks.push(this.currentTextContent)
				} else {
					// Update the existing text content
					this.currentTextContent.content = this.accumulator.slice(this.currentTextContentStartIndex).trim()
				}
			}
		}

		return this.getContentBlocks()
	}

	/**
	 * Finalize any partial content blocks.
	 * Should be called after processing the last chunk.
	 */
	public finalizeContentBlocks(): void {
		// Mark all partial blocks as complete
		for (const block of this.contentBlocks) {
			if (block.partial) {
				block.partial = false
			}
			if (block.type === "text" && typeof block.content === "string") {
				block.content = block.content.trim()
			}
		}
	}
}
