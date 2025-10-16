import { describe, it, expect } from "vitest"
import { sanitizeMessagesForUIStorage, purgeFileContentsFromMessages } from "../sanitizeMessages"
import type { ClineMessage } from "@roo-code/types"

describe("sanitizeMessages", () => {
	describe("sanitizeMessagesForUIStorage", () => {
		it("should leave non-tool messages unchanged", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "say",
					say: "text",
					text: "This is a regular text message",
				},
				{
					ts: 1234567891,
					type: "ask",
					ask: "followup",
					text: "What would you like to do next?",
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			expect(sanitized).toEqual(messages)
		})

		it("should strip content from single readFile tool messages", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						path: "/path/to/file.ts",
						content:
							"const longFileContent = 'This is a very long file content that should be stripped because it is over 100 characters long and takes up unnecessary space in storage';",
					}),
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			const parsedText = JSON.parse(sanitized[0].text!)

			expect(parsedText.tool).toBe("readFile")
			expect(parsedText.path).toBe("/path/to/file.ts")
			expect(parsedText.content).toBe("[content stripped for storage]")
		})

		it("should keep short content in readFile messages", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						path: "/path/to/file.ts",
						content: "short content",
					}),
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			const parsedText = JSON.parse(sanitized[0].text!)

			expect(parsedText.content).toBe("short content")
		})

		it("should sanitize batchFiles in readFile tool messages", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						batchFiles: [
							{
								path: "/path/to/file1.ts",
								lineSnippet: "(lines 1-100)",
								isOutsideWorkspace: false,
								key: "file1.ts (lines 1-100)",
								content: "/full/path/to/file1.ts",
							},
							{
								path: "/path/to/file2.ts",
								lineSnippet: "(lines 1-50)",
								isOutsideWorkspace: true,
								key: "file2.ts (lines 1-50)",
								content: "/full/path/to/file2.ts",
							},
						],
					}),
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			const parsedText = JSON.parse(sanitized[0].text!)

			expect(parsedText.tool).toBe("readFile")
			expect(parsedText.batchFiles).toHaveLength(2)
			expect(parsedText.batchFiles[0].path).toBe("/path/to/file1.ts")
			expect(parsedText.batchFiles[0].lineSnippet).toBe("(lines 1-100)")
			expect(parsedText.batchFiles[0].content).toBeUndefined()
			expect(parsedText.batchFiles[1].path).toBe("/path/to/file2.ts")
			expect(parsedText.batchFiles[1].content).toBeUndefined()
		})

		it("should handle messages without text field", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "say",
					say: "checkpoint_saved",
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			expect(sanitized).toEqual(messages)
		})

		it("should handle messages with non-JSON text", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "say",
					say: "text",
					text: "This is not JSON",
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			expect(sanitized).toEqual(messages)
		})

		it("should handle messages with malformed JSON", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "say",
					say: "text",
					text: '{"broken": json',
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			expect(sanitized).toEqual(messages)
		})

		it("should preserve other tool messages unchanged", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "writeFile",
						path: "/path/to/file.ts",
						content: "new file content",
					}),
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)
			expect(sanitized).toEqual(messages)
		})

		it("should handle mixed message types", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1,
					type: "say",
					say: "text",
					text: "Regular message",
				},
				{
					ts: 2,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						path: "/file.ts",
						content: "a".repeat(200), // Long content
					}),
				},
				{
					ts: 3,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "writeFile",
						path: "/other.ts",
						content: "write content",
					}),
				},
			]

			const sanitized = sanitizeMessagesForUIStorage(messages)

			expect(sanitized[0]).toEqual(messages[0])

			const readFileMsg = JSON.parse(sanitized[1].text!)
			expect(readFileMsg.content).toBe("[content stripped for storage]")

			expect(sanitized[2]).toEqual(messages[2])
		})
	})

	describe("purgeFileContentsFromMessages", () => {
		it("should use the same sanitization logic", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						path: "/path/to/file.ts",
						content: "x".repeat(150),
					}),
				},
			]

			const purged = purgeFileContentsFromMessages(messages)
			const parsedText = JSON.parse(purged[0].text!)

			expect(parsedText.content).toBe("[content stripped for storage]")
		})

		it("should handle already sanitized messages gracefully", () => {
			const messages: ClineMessage[] = [
				{
					ts: 1234567890,
					type: "ask",
					ask: "tool",
					text: JSON.stringify({
						tool: "readFile",
						path: "/path/to/file.ts",
						content: "[content stripped for storage]",
					}),
				},
			]

			const purged = purgeFileContentsFromMessages(messages)
			const parsedText = JSON.parse(purged[0].text!)

			expect(parsedText.content).toBe("[content stripped for storage]")
		})
	})
})
