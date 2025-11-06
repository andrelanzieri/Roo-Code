// npx vitest run src/components/chat/__tests__/ChatView.cancel-button.spec.tsx

import React from "react"
import { render, waitFor, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import ChatView, { ChatViewProps } from "../ChatView"

// Define minimal types needed for testing
interface ClineMessage {
	type: "say" | "ask"
	say?: string
	ask?: string
	ts: number
	text?: string
	partial?: boolean
}

interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: any[]
	shouldShowAnnouncement: boolean
	allowedCommands: string[]
	alwaysAllowExecute: boolean
	[key: string]: any
}

// Mock vscode API
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock use-sound hook
const mockPlayFunction = vi.fn()
vi.mock("use-sound", () => ({
	default: vi.fn().mockImplementation(() => {
		return [mockPlayFunction]
	}),
}))

// Mock components
vi.mock("../BrowserSessionRow", () => ({
	default: function MockBrowserSessionRow() {
		return <div data-testid="browser-session"></div>
	},
}))

vi.mock("../ChatRow", () => ({
	default: function MockChatRow() {
		return <div data-testid="chat-row"></div>
	},
}))

vi.mock("../AutoApproveMenu", () => ({
	default: () => null,
}))

vi.mock("../../common/VersionIndicator", () => ({
	default: () => null,
}))

vi.mock("../Announcement", () => ({
	default: () => null,
}))

vi.mock("@/components/common/DismissibleUpsell", () => ({
	default: () => null,
}))

vi.mock("../QueuedMessages", () => ({
	QueuedMessages: () => null,
}))

vi.mock("@src/components/welcome/RooTips", () => ({
	default: () => null,
}))

vi.mock("@src/components/welcome/RooHero", () => ({
	default: () => null,
}))

vi.mock("../common/TelemetryBanner", () => ({
	default: () => null,
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mockReact = require("react")

	return {
		default: mockReact.forwardRef(function MockChatTextArea(_: any, ref: React.ForwardedRef<any>) {
			mockReact.useImperativeHandle(ref, () => ({
				focus: vi.fn(),
			}))

			return <div data-testid="chat-textarea" />
		}),
		ChatTextArea: () => <div data-testid="chat-textarea" />,
	}
})

// Mock VSCode components
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeButton: function MockVSCodeButton({
		children,
		onClick,
		disabled,
	}: {
		children: React.ReactNode
		onClick?: () => void
		disabled?: boolean
	}) {
		return (
			<button onClick={onClick} disabled={disabled} data-testid="vscode-button">
				{children}
			</button>
		)
	},
	VSCodeTextField: () => null,
	VSCodeLink: () => null,
}))

// Helper to mock window.postMessage for state hydration
const mockPostMessage = (state: Partial<ExtensionState>) => {
	window.postMessage(
		{
			type: "state",
			state: {
				version: "1.0.0",
				clineMessages: [],
				taskHistory: [],
				shouldShowAnnouncement: false,
				allowedCommands: [],
				alwaysAllowExecute: false,
				cloudIsAuthenticated: false,
				telemetrySetting: "enabled",
				...state,
			},
		},
		"*",
	)
}

const defaultProps: ChatViewProps = {
	isHidden: false,
	showAnnouncement: false,
	hideAnnouncement: () => {},
}

const queryClient = new QueryClient()

const renderChatView = (props: Partial<ChatViewProps> = {}) => {
	return render(
		<ExtensionStateContextProvider>
			<QueryClientProvider client={queryClient}>
				<ChatView {...defaultProps} {...props} />
			</QueryClientProvider>
		</ExtensionStateContextProvider>,
	)
}

describe("ChatView - Cancel Button Tests", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps cancel button enabled during API request even with tool approval dialog", async () => {
		const { container } = renderChatView()

		// First hydrate state with initial task
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 3000,
					text: "Initial task",
				},
			],
		})

		// Add API request in progress (no cost)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 3000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 2000,
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
			],
		})

		// Clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()

		// Add tool approval dialog while API is still running
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 3000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 2000,
					text: JSON.stringify({ apiProtocol: "anthropic" }), // Still no cost
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "readFile", path: "test.txt" }),
					partial: false,
				},
			],
		})

		// Wait for component to update
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			// Find the cancel button (should be displayed when isApiRequestInProgress is true)
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))

			expect(cancelButton).toBeTruthy()
			expect(cancelButton?.getAttribute("disabled")).toBe("false")
		})
	})

	it("disables cancel button after it is clicked (pending state)", async () => {
		const { container } = renderChatView()

		// Set up state with API request in progress
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
			],
		})

		// Clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()

		// Wait for cancel button to be rendered
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))
			expect(cancelButton).toBeTruthy()
		})

		// Find and click the cancel button
		const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
		const cancelButton = Array.from(buttons).find((btn) =>
			btn.textContent?.includes("chat:cancel.title"),
		) as HTMLButtonElement

		fireEvent.click(cancelButton)

		// Check that cancel message was sent
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "cancelTask",
			})
		})

		// Cancel button should be temporarily disabled to prevent rapid clicks
		// Note: The implementation sets isCancelPending which affects the disabled state
		expect(cancelButton.disabled).toBe(true)

		// After timeout, button should be enabled again (if still showing)
		vi.advanceTimersByTime(1000)

		// Note: In the real implementation, the button might disappear after cancel,
		// but the isCancelPending flag would be reset after 1 second
	})

	it("shows cancel button when API request is in progress without tool dialog", async () => {
		const { container } = renderChatView()

		// Set up state with only API request (no tool dialog)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
			],
		})

		// Wait for cancel button to appear
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))

			expect(cancelButton).toBeTruthy()
			expect(cancelButton?.getAttribute("disabled")).toBe("false")
		})
	})

	it("hides cancel button when API request completes (cost present)", async () => {
		const { container } = renderChatView()

		// Start with API request in progress
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 1000,
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
			],
		})

		// Wait for cancel button to appear
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))
			expect(cancelButton).toBeTruthy()
		})

		// Complete the API request (add cost)
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 1000,
					text: JSON.stringify({
						apiProtocol: "anthropic",
						cost: 0.05, // Cost present = completed
						tokensIn: 100,
						tokensOut: 50,
					}),
				},
			],
		})

		// Cancel button should disappear when API request completes
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))

			// Cancel button should not be present when API is complete
			expect(cancelButton).toBeFalsy()
		})
	})

	it("tracks API request state separately from UI streaming state", async () => {
		const { container } = renderChatView()

		// Set up complex state with tool dialog AND API request
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 3000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now() - 2000,
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
				{
					type: "ask",
					ask: "tool",
					ts: Date.now(),
					text: JSON.stringify({ tool: "editedExistingFile", path: "test.txt" }),
					partial: false, // Tool dialog is complete
				},
			],
		})

		// Wait for buttons to be rendered
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			expect(buttons.length).toBeGreaterThan(0)
		})

		// Should have both approve/reject buttons AND cancel button
		const buttons = container.querySelectorAll('[data-testid="vscode-button"]')

		// Find buttons by their text content
		const approveButton = Array.from(buttons).find(
			(btn) => btn.textContent?.includes("chat:save.title") || btn.textContent?.includes("chat:approve.title"),
		)
		const rejectButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:reject.title"))
		const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))

		// Tool dialog buttons should be present
		expect(approveButton).toBeTruthy()
		expect(rejectButton).toBeTruthy()

		// Cancel button should also be present due to API request in progress
		expect(cancelButton).toBeTruthy()
		expect(cancelButton?.getAttribute("disabled")).toBe("false")
	})

	it("prevents multiple rapid cancel button clicks", async () => {
		const { container } = renderChatView()

		// Set up state with API request in progress
		mockPostMessage({
			clineMessages: [
				{
					type: "say",
					say: "task",
					ts: Date.now() - 2000,
					text: "Initial task",
				},
				{
					type: "say",
					say: "api_req_started",
					ts: Date.now(),
					text: JSON.stringify({ apiProtocol: "anthropic" }), // No cost = streaming
				},
			],
		})

		// Clear any initial calls
		vi.mocked(vscode.postMessage).mockClear()

		// Wait for cancel button to be rendered
		await waitFor(() => {
			const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
			const cancelButton = Array.from(buttons).find((btn) => btn.textContent?.includes("chat:cancel.title"))
			expect(cancelButton).toBeTruthy()
		})

		// Find the cancel button
		const buttons = container.querySelectorAll('[data-testid="vscode-button"]')
		const cancelButton = Array.from(buttons).find((btn) =>
			btn.textContent?.includes("chat:cancel.title"),
		) as HTMLButtonElement

		// Click cancel button multiple times rapidly
		fireEvent.click(cancelButton)
		fireEvent.click(cancelButton)
		fireEvent.click(cancelButton)

		// Should only send one cancel message despite multiple clicks
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledTimes(1)
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "cancelTask",
			})
		})
	})
})
