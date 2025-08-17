/**
 * Utility functions for repairing broken XML tool calls from LLM providers
 * that don't properly format XML responses.
 */

import { toolNames, type ToolName } from "@roo-code/types"
import { toolParamNames, type ToolParamName } from "../../shared/tools"

/**
 * Attempts to repair broken XML tool calls by adding missing opening brackets
 * and fixing common formatting issues.
 *
 * @param brokenXml - The potentially broken XML string
 * @returns The repaired XML string, or the original if no repairs were needed
 *
 * @example
 * // Input: "read_file>\nargs>\n<file>\n<path>main.gopath>\n</file>\nargs>\nread_file>"
 * // Output: "<read_file>\n<args>\n<file>\n<path>main.go</path>\n</file>\n</args>\n</read_file>"
 */
export function repairBrokenXml(brokenXml: string): string {
	// Don't check for valid structure - we need to repair even partially valid XML
	let repairedXml = brokenXml

	// Split into lines for easier processing
	const lines = repairedXml.split("\n")
	const repairedLines: string[] = []

	// Create a set of all valid tag names for quick lookup
	const allTagNames = new Set<string>([...toolNames, ...toolParamNames])

	// Track open tags to determine if we need opening or closing tags
	const openTags: string[] = []

	for (let line of lines) {
		let repairedLine = line
		const trimmedLine = line.trim()

		// Skip empty lines
		if (!trimmedLine) {
			repairedLines.push(repairedLine)
			continue
		}

		// Get the indentation from the original line
		const indent = line.match(/^(\s*)/)?.[1] || ""

		// Handle lines that already start with < and end with >
		if (trimmedLine.startsWith("<") && trimmedLine.endsWith(">")) {
			// Check for double brackets like <<args> or <</args>
			if (trimmedLine.match(/^<<|>>$/)) {
				repairedLine = repairedLine.replace(/<<\//g, "</").replace(/<</g, "<").replace(/>>/g, ">")
			}

			// Check for special case: <path>main.gopath> should become <path>main.go</path>
			// This happens when content is merged with the tag name (missing </ in closing tag)
			// Only apply if it doesn't already have a proper closing tag
			if (!trimmedLine.includes("</")) {
				for (const tagName of allTagNames) {
					const mergedPattern = new RegExp(`^<${tagName}>(.+)${tagName}>$`)
					const mergedMatch = trimmedLine.match(mergedPattern)
					if (mergedMatch) {
						// Remove the tag name from the content
						const content = mergedMatch[1]
						const cleanContent = content.endsWith(tagName)
							? content.substring(0, content.length - tagName.length)
							: content
						repairedLine = `${indent}<${tagName}>${cleanContent}</${tagName}>`
						break
					}
				}
			}

			// Track open/closed tags
			if (trimmedLine.startsWith("</")) {
				const tagName = trimmedLine.match(/^<\/([^>]+)>$/)?.[1]
				if (tagName) {
					// Remove from open tags if it matches
					const lastIndex = openTags.lastIndexOf(tagName)
					if (lastIndex >= 0) {
						openTags.splice(lastIndex, 1)
					}
				}
			} else {
				const tagName = trimmedLine.match(/^<([^/>]+)>$/)?.[1]
				if (tagName && allTagNames.has(tagName)) {
					openTags.push(tagName)
				}
			}

			repairedLines.push(repairedLine)
			continue
		}

		// Handle lines that don't start with < (missing opening bracket)
		let handled = false

		// Check for patterns like "regex>pattern</regex>"
		// This needs to be handled before other patterns
		for (const tagName of allTagNames) {
			const contentPattern = new RegExp(`^${tagName}>(.+)</${tagName}>$`)
			const contentMatch = trimmedLine.match(contentPattern)
			if (contentMatch) {
				repairedLine = `${indent}<${tagName}>${contentMatch[1]}</${tagName}>`
				handled = true
				break
			}
		}

		if (!handled) {
			// Check each known tag name
			for (const tagName of allTagNames) {
				// Pattern 1: "/tagName>" at start of line (missing opening bracket for closing tag)
				if (trimmedLine === `/${tagName}>` || trimmedLine.startsWith(`/${tagName}>`)) {
					repairedLine = `${indent}</${tagName}>`
					// Remove from open tags if it matches
					const lastIndex = openTags.lastIndexOf(tagName)
					if (lastIndex >= 0) {
						openTags.splice(lastIndex, 1)
					}
					handled = true
					break
				}

				// Pattern 2: "tagName>" at start of line
				if (trimmedLine === `${tagName}>`) {
					// Check if we have this tag open - if so, it's likely a closing tag
					if (openTags.includes(tagName)) {
						repairedLine = `${indent}</${tagName}>`
						// Remove from open tags
						const lastIndex = openTags.lastIndexOf(tagName)
						if (lastIndex >= 0) {
							openTags.splice(lastIndex, 1)
						}
					} else {
						// It's an opening tag
						repairedLine = `${indent}<${tagName}>`
						openTags.push(tagName)
					}
					handled = true
					break
				}

				// Pattern 3: "tagName>" with content after it
				if (trimmedLine.startsWith(`${tagName}>`)) {
					const restOfLine = trimmedLine.substring(tagName.length + 1)
					// Check if this is something like "main.gopath>" where content is merged with tag
					if (restOfLine.endsWith(`${tagName}>`)) {
						// Remove the tag name from the end of content
						const content = restOfLine.substring(0, restOfLine.length - tagName.length - 1)
						// Remove the tag name if it appears at the end of content (like "main.gopath" -> "main.go")
						const cleanContent = content.endsWith(tagName)
							? content.substring(0, content.length - tagName.length)
							: content
						repairedLine = `${indent}<${tagName}>${cleanContent}</${tagName}>`
					} else {
						// Just missing the opening bracket
						repairedLine = `${indent}<${tagName}>${restOfLine}`
						openTags.push(tagName)
					}
					handled = true
					break
				}
			}
		}

		// Handle special case: content ending with "tagName>" like "main.gopath>"
		if (!handled) {
			for (const tagName of allTagNames) {
				// Check if line ends with "tagName>" and doesn't start with a tag
				if (trimmedLine.endsWith(`${tagName}>`) && !trimmedLine.startsWith("<")) {
					const beforeTag = trimmedLine.substring(0, trimmedLine.length - tagName.length - 1)
					if (beforeTag) {
						// Check if the content ends with the tag name (like "main.gopath")
						if (beforeTag.endsWith(tagName)) {
							const cleanContent = beforeTag.substring(0, beforeTag.length - tagName.length)
							repairedLine = `${indent}${cleanContent}</${tagName}>`
						} else {
							// Content doesn't end with tag name, just add closing tag
							repairedLine = `${indent}${beforeTag}</${tagName}>`
						}
						// Remove from open tags if it matches
						const lastIndex = openTags.lastIndexOf(tagName)
						if (lastIndex >= 0) {
							openTags.splice(lastIndex, 1)
						}
						handled = true
						break
					}
				}
			}
		}

		repairedLines.push(repairedLine)
	}

	return repairedLines.join("\n")
}

/**
 * Checks if the XML has a valid structure with proper opening and closing tags
 */
function hasValidXmlStructure(xml: string): boolean {
	// Check if we have at least one valid tool opening tag
	const hasValidToolTag = toolNames.some(
		(toolName) => xml.includes(`<${toolName}>`) && xml.includes(`</${toolName}>`),
	)

	return hasValidToolTag
}

/**
 * Detects if a string contains broken XML patterns that need repair
 *
 * @param text - The text to check for broken XML
 * @returns true if broken XML patterns are detected
 */
export function hasBrokenXmlPattern(text: string): boolean {
	const lines = text.split("\n")

	for (const line of lines) {
		const trimmedLine = line.trim()

		// Check for tool names without opening brackets
		for (const toolName of toolNames) {
			// Check if line starts with toolName> (missing opening bracket)
			if (trimmedLine.startsWith(`${toolName}>`) || trimmedLine.startsWith(`/${toolName}>`)) {
				return true
			}
			// Check if line is just toolName> (likely a closing tag)
			if (trimmedLine === `${toolName}>`) {
				return true
			}
		}

		// Check for parameter names without opening brackets
		for (const paramName of toolParamNames) {
			// Check if line starts with paramName> (missing opening bracket)
			if (trimmedLine.startsWith(`${paramName}>`) || trimmedLine.startsWith(`/${paramName}>`)) {
				return true
			}
			// Check if line is just paramName> (likely a closing tag)
			if (trimmedLine === `${paramName}>`) {
				return true
			}
		}
	}

	return false
}

/**
 * Configuration for XML auto-repair behavior
 */
export interface XmlAutoRepairConfig {
	/** Whether to enable automatic XML repair */
	enabled: boolean
	/** Whether to use a small model for repair (future enhancement) */
	useSmallModel?: boolean
	/** The model to use for repair if useSmallModel is true */
	repairModelId?: string
}
