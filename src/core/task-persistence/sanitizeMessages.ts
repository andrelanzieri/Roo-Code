import type { ClineMessage } from "@roo-code/types"
import type { ClineSayTool } from "../../shared/ExtensionMessage"

// Constants for sanitization
const CONTENT_TRUNCATION_LENGTH = 100
const STRIPPED_CONTENT_MARKER = "[content stripped for storage]"

/**
 * Sanitizes messages for storage in ui_messages.json by removing large file contents
 * from read_file tool messages while preserving essential metadata.
 * This prevents storage bloat and UI performance issues.
 *
 * @param messages - Array of ClineMessage objects to sanitize
 * @returns Sanitized copy of messages with file contents stripped
 */
export function sanitizeMessagesForUIStorage(messages: ClineMessage[]): ClineMessage[] {
	return messages.map((message) => {
		// Only process messages with text content
		if (!message.text || typeof message.text !== "string") {
			return message
		}

		// Try to parse as JSON to check if it's a tool message
		try {
			const parsed = JSON.parse(message.text)

			// Check if this is a readFile tool message
			if (parsed.tool === "readFile") {
				const sanitized = sanitizeReadFileMessage(parsed)
				return {
					...message,
					text: JSON.stringify(sanitized),
				}
			}

			return message
		} catch {
			// Not JSON or parsing failed, return as-is
			return message
		}
	})
}

/**
 * Sanitizes a read_file tool message by removing file contents while preserving metadata
 */
function sanitizeReadFileMessage(toolMessage: any): any {
	const sanitized: any = {
		...toolMessage,
	}

	// Handle single file reads with content field
	if ("content" in sanitized) {
		// Keep the path but replace content with a placeholder
		if (typeof sanitized.content === "string" && sanitized.content.length > CONTENT_TRUNCATION_LENGTH) {
			sanitized.content = STRIPPED_CONTENT_MARKER
		}
	}

	// Handle batch file reads
	if (sanitized.batchFiles && Array.isArray(sanitized.batchFiles)) {
		sanitized.batchFiles = sanitized.batchFiles.map((file: any) => {
			const sanitizedFile = { ...file }
			// Remove the actual file content, keep only metadata
			// Add type checking for content field
			if ("content" in sanitizedFile && typeof sanitizedFile.content === "string") {
				delete sanitizedFile.content
			}
			return sanitizedFile
		})
	}

	return sanitized
}

/**
 * Purges file contents from existing messages during rehydration.
 * This is used for backward compatibility to clean up already-saved messages
 * that contain full file contents.
 *
 * @param messages - Array of ClineMessage objects from storage
 * @returns Messages with file contents purged
 */
export function purgeFileContentsFromMessages(messages: ClineMessage[]): ClineMessage[] {
	return sanitizeMessagesForUIStorage(messages)
}
