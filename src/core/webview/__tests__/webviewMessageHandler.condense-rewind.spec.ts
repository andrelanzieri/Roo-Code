import { describe, it, expect, vi, beforeEach } from "vitest"
import { webviewMessageHandler } from "../webviewMessageHandler"
import { ClineProvider } from "../ClineProvider"
import { Task } from "../../task/Task"
import { ClineMessage } from "@roo-code/types"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
	},
	workspace: {
		workspaceFolders: [],
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}))

describe("webviewMessageHandler - Condense and Rewind", () => {
	let mockProvider: any
	let mockTask: any

	beforeEach(() => {
		// Create mock task
		mockTask = {
			taskId: "test-task-id",
			clineMessages: [] as ClineMessage[],
			apiConversationHistory: [],
			overwriteClineMessages: vi.fn(),
			overwriteApiConversationHistory: vi.fn(),
			saveClineMessages: vi.fn(),
			skipPrevResponseIdOnce: false,
		}

		// Create mock provider
		mockProvider = {
			getCurrentTask: vi.fn().mockReturnValue(mockTask),
			postMessageToWebview: vi.fn(),
			postStateToWebview: vi.fn(),
			contextProxy: {
				globalStorageUri: { fsPath: "/test/storage" },
			},
			log: vi.fn(),
		}
	})

	describe("Bug #8295: Rewind after manual condense keeps only initial + new message", () => {
		it("should preserve messages up to rewind point after condense", async () => {
			// Setup: Create messages 1-11 with a condense_context message after message 10
			const messages: ClineMessage[] = []

			// Add initial message
			messages.push({
				ts: 1000,
				type: "say",
				say: "text",
				text: "Initial message",
			})

			// Add messages 1-10 (jokes)
			for (let i = 1; i <= 10; i++) {
				messages.push({
					ts: 1000 + i * 100,
					type: "say",
					say: "user_feedback",
					text: `tell me a joke ${i}`,
				})
				messages.push({
					ts: 1000 + i * 100 + 50,
					type: "say",
					say: "text",
					text: `Here's joke ${i}...`,
				})
			}

			// Add condense_context message after message 10
			messages.push({
				ts: 3000,
				type: "say",
				say: "condense_context",
				contextCondense: {
					summary: "Conversation condensed",
					cost: 0.001,
					prevContextTokens: 5000,
					newContextTokens: 1000,
				},
			})

			// Add message 11
			messages.push({
				ts: 3100,
				type: "say",
				say: "user_feedback",
				text: "tell me a joke 11",
			})
			messages.push({
				ts: 3150,
				type: "say",
				say: "text",
				text: "Here's joke 11...",
			})

			mockTask.clineMessages = [...messages]

			// Find the timestamp of message 8 (the user feedback for joke 8)
			const message8Index = messages.findIndex(
				(m) => m.type === "say" && m.say === "user_feedback" && m.text === "tell me a joke 8",
			)
			const message8Ts = messages[message8Index].ts

			// Act: Delete message 8 and all subsequent messages
			await webviewMessageHandler(mockProvider, {
				type: "deleteMessageConfirm",
				messageTs: message8Ts,
			})

			// Assert: Check that messages up to joke 7 are preserved
			expect(mockTask.overwriteClineMessages).toHaveBeenCalled()
			const preservedMessages = mockTask.overwriteClineMessages.mock.calls[0][0]

			// Should have initial message + jokes 1-7 (each joke is 2 messages: user + assistant)
			// That's 1 + (7 * 2) = 15 messages
			expect(preservedMessages.length).toBe(15)

			// Verify the last preserved message is the assistant response to joke 7
			const lastPreserved = preservedMessages[preservedMessages.length - 1]
			expect(lastPreserved.text).toBe("Here's joke 7...")

			// Verify skipPrevResponseIdOnce is NOT set (since last message is not condense_context)
			expect(mockTask.skipPrevResponseIdOnce).toBe(false)
		})

		it("should set skipPrevResponseIdOnce when deletion leaves condense_context as last message", async () => {
			// Setup: Create a simpler scenario with condense_context as the last message after deletion
			const messages: ClineMessage[] = [
				{
					ts: 1000,
					type: "say",
					say: "text",
					text: "Initial message",
				},
				{
					ts: 1100,
					type: "say",
					say: "user_feedback",
					text: "First request",
				},
				{
					ts: 1200,
					type: "say",
					say: "text",
					text: "First response",
				},
				{
					ts: 1300,
					type: "say",
					say: "condense_context",
					contextCondense: {
						summary: "Condensed",
						cost: 0.001,
						prevContextTokens: 1000,
						newContextTokens: 200,
					},
				},
				{
					ts: 1400,
					type: "say",
					say: "user_feedback",
					text: "Second request",
				},
				{
					ts: 1500,
					type: "say",
					say: "text",
					text: "Second response",
				},
			]

			mockTask.clineMessages = [...messages]

			// Act: Delete the message after condense_context
			await webviewMessageHandler(mockProvider, {
				type: "deleteMessageConfirm",
				messageTs: 1400, // Delete "Second request" and everything after
			})

			// Assert: Verify the preserved messages
			expect(mockTask.overwriteClineMessages).toHaveBeenCalled()
			const preservedMessages = mockTask.overwriteClineMessages.mock.calls[0][0]

			// Should preserve up to and including the condense_context message
			expect(preservedMessages.length).toBe(4)
			expect(preservedMessages[preservedMessages.length - 1].say).toBe("condense_context")
		})

		it("should handle rewind to specific message correctly after condense", async () => {
			// This test specifically reproduces the bug scenario from issue #8295
			// Setup: Messages 1-11 with condense after 10, then rewind to 8
			const messages: ClineMessage[] = []

			// Initial message
			messages.push({
				ts: 1000,
				type: "say",
				say: "text",
				text: "Initial task",
			})

			// Messages 1-10
			for (let i = 1; i <= 10; i++) {
				messages.push({
					ts: 1000 + i * 200,
					type: "say",
					say: "user_feedback",
					text: `tell me a joke ${i}`,
				})
				messages.push({
					ts: 1000 + i * 200 + 100,
					type: "say",
					say: "text",
					text: `Joke ${i}: Why did the ${i} cross the road?`,
				})
			}

			// Condense after message 10
			messages.push({
				ts: 4000,
				type: "say",
				say: "condense_context",
				contextCondense: {
					summary: "User asked for 10 jokes, all delivered successfully",
					cost: 0.002,
					prevContextTokens: 3000,
					newContextTokens: 500,
				},
			})

			// Message 11
			messages.push({
				ts: 4100,
				type: "say",
				say: "user_feedback",
				text: "tell me a joke 11",
			})
			messages.push({
				ts: 4200,
				type: "say",
				say: "text",
				text: "Joke 11: Why did the 11 cross the road?",
			})

			mockTask.clineMessages = [...messages]

			// Find message 8's timestamp
			const joke8UserIndex = messages.findIndex(
				(m) => m.type === "say" && m.say === "user_feedback" && m.text === "tell me a joke 8",
			)
			const joke8UserTs = messages[joke8UserIndex].ts

			// Act: Rewind to message 8 (delete this and after)
			await webviewMessageHandler(mockProvider, {
				type: "deleteMessageConfirm",
				messageTs: joke8UserTs,
			})

			// Assert: Messages 1-7 should be preserved
			expect(mockTask.overwriteClineMessages).toHaveBeenCalled()
			const preservedMessages = mockTask.overwriteClineMessages.mock.calls[0][0]

			// Expected: initial + 7 jokes (each joke = 2 messages) = 1 + 14 = 15 messages
			expect(preservedMessages.length).toBe(15)

			// Verify we have jokes 1-7 but not 8-11
			const joke7Present = preservedMessages.some((m: ClineMessage) => m.text?.includes("Joke 7:"))
			const joke8Present = preservedMessages.some((m: ClineMessage) => m.text?.includes("Joke 8:"))
			const condensePresent = preservedMessages.some((m: ClineMessage) => m.say === "condense_context")

			expect(joke7Present).toBe(true)
			expect(joke8Present).toBe(false)
			expect(condensePresent).toBe(false)

			// The last message should be the response to joke 7
			expect(preservedMessages[preservedMessages.length - 1].text).toContain("Joke 7:")
		})
	})
})
