import React from "react"
import { render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import "@testing-library/jest-dom"

// Mock dependencies before importing components
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("use-sound", () => ({
	default: () => [vi.fn()],
}))

// Mock the extension state hook
vi.mock("@src/context/ExtensionStateContext", async () => {
	const actual = await vi.importActual("@src/context/ExtensionStateContext")
	return {
		...actual,
		useExtensionState: vi.fn(() => ({
			clineMessages: [],
			taskHistory: [],
			apiConfiguration: { apiProvider: "test" },
			messageQueue: [],
			mode: "code",
			customModes: [],
			setMode: vi.fn(),
		})),
	}
})

// Now import components after all mocks are set up
import ChatView from "../ChatView"
import { ExtensionStateContextProvider, useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

// Set up global mock
;(global as any).acquireVsCodeApi = () => ({
	postMessage: vi.fn(),
	getState: () => ({}),
	setState: vi.fn(),
})

const queryClient = new QueryClient({
	defaultOptions: {
		queries: { retry: false },
		mutations: { retry: false },
	},
})

const renderChatView = () => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={vi.fn()} />
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatView - Queued Messages", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should preserve input text when processing queued messages", async () => {
		// Mock the state with a queued message
		const mockUseExtensionState = useExtensionState as any
		mockUseExtensionState.mockReturnValue({
			clineMessages: [],
			taskHistory: [],
			apiConfiguration: { apiProvider: "test" },
			messageQueue: [
				{
					id: "queue-1",
					text: "Queued message",
					images: [],
					timestamp: Date.now(),
				},
			],
			mode: "code",
			customModes: [],
			setMode: vi.fn(),
		})

		const { container } = renderChatView()

		// Find the textarea
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement
		expect(textarea).toBeTruthy()

		// User types new text while message is queued
		await userEvent.type(textarea, "New text typed by user")
		expect(textarea.value).toBe("New text typed by user")

		// Simulate backend processing the queued message by sending invoke message
		const invokeMessage = new MessageEvent("message", {
			data: {
				type: "invoke",
				invoke: "sendMessage",
				text: "Queued message",
				images: [],
			},
		})
		window.dispatchEvent(invokeMessage)

		// Wait for any async operations
		await waitFor(() => {
			// The input should still contain the user's typed text
			expect(textarea.value).toBe("New text typed by user")
		})

		// Verify the queued message was sent
		expect(vscode.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: expect.stringMatching(/newTask|askResponse/),
			}),
		)
	})

	it("should clear input when sending a regular message (not from queue)", async () => {
		// Mock the state with no queued messages
		const mockUseExtensionState = useExtensionState as any
		mockUseExtensionState.mockReturnValue({
			clineMessages: [],
			taskHistory: [],
			apiConfiguration: { apiProvider: "test" },
			messageQueue: [], // No queued messages
			mode: "code",
			customModes: [],
			setMode: vi.fn(),
		})

		const { container } = renderChatView()

		// Find the textarea
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement
		expect(textarea).toBeTruthy()

		// User types text
		await userEvent.type(textarea, "Regular message")
		expect(textarea.value).toBe("Regular message")

		// Simulate backend sending invoke message for a non-queued message
		const invokeMessage = new MessageEvent("message", {
			data: {
				type: "invoke",
				invoke: "sendMessage",
				text: "Different message not in queue",
				images: [],
			},
		})
		window.dispatchEvent(invokeMessage)

		// Wait for any async operations
		await waitFor(() => {
			// The input should be cleared since this is not a queued message
			expect(textarea.value).toBe("")
		})
	})

	it("should handle messages with images correctly", async () => {
		// Mock the state with a queued message with image
		const mockUseExtensionState = useExtensionState as any
		mockUseExtensionState.mockReturnValue({
			clineMessages: [],
			taskHistory: [],
			apiConfiguration: { apiProvider: "test" },
			messageQueue: [
				{
					id: "queue-2",
					text: "Message with image",
					images: ["data:image/png;base64,abc123"],
					timestamp: Date.now(),
				},
			],
			mode: "code",
			customModes: [],
			setMode: vi.fn(),
		})

		const { container } = renderChatView()

		// Find the textarea
		const textarea = container.querySelector("textarea") as HTMLTextAreaElement
		expect(textarea).toBeTruthy()

		// User types new text
		await userEvent.type(textarea, "User typing while image message queued")
		expect(textarea.value).toBe("User typing while image message queued")

		// Simulate backend processing the queued message with image
		const invokeMessage = new MessageEvent("message", {
			data: {
				type: "invoke",
				invoke: "sendMessage",
				text: "Message with image",
				images: ["data:image/png;base64,abc123"],
			},
		})
		window.dispatchEvent(invokeMessage)

		// Wait for any async operations
		await waitFor(() => {
			// The input should still contain the user's typed text
			expect(textarea.value).toBe("User typing while image message queued")
		})
	})
})
