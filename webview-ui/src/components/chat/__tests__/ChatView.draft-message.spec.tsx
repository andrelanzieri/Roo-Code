// npx vitest run src/components/chat/__tests__/ChatView.draft-message.spec.tsx

import React from "react"
import { act, render, waitFor } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import { ExtensionStateContextProvider } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"

import ChatView, { type ChatViewProps } from "../ChatView"

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("use-sound", () => ({
	default: vi.fn().mockImplementation(() => {
		return [vi.fn()]
	}),
}))

vi.mock("../BrowserSessionRow", () => ({
	default: () => null,
}))

vi.mock("../ChatRow", () => ({
	default: () => null,
}))

vi.mock("../AutoApproveMenu", () => ({
	default: () => null,
}))

vi.mock("../common/TelemetryBanner", () => ({
	default: () => null,
}))

vi.mock("../Announcement", () => ({
	default: () => null,
}))

vi.mock("../TaskHeader", () => ({
	default: () => null,
}))

vi.mock("../SystemPromptWarning", () => ({
	default: () => null,
}))

vi.mock("../ProfileViolationWarning", () => ({
	default: () => null,
}))

vi.mock("../CheckpointWarning", () => ({
	CheckpointWarning: () => null,
}))

vi.mock("../QueuedMessages", () => ({
	QueuedMessages: () => null,
}))

vi.mock("../history/HistoryPreview", () => ({
	default: () => null,
}))

vi.mock("@src/components/welcome/RooHero", () => ({
	default: () => null,
}))

vi.mock("@src/components/welcome/RooTips", () => ({
	default: () => null,
}))

vi.mock("@src/hooks/useCloudUpsell", () => ({
	useCloudUpsell: () => ({
		isOpen: false,
		openUpsell: vi.fn(),
		closeUpsell: vi.fn(),
		handleConnect: vi.fn(),
	}),
}))

vi.mock("@src/components/cloud/CloudUpsellDialog", () => ({
	CloudUpsellDialog: () => null,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
	initReactI18next: {
		type: "3rdParty",
		init: () => {},
	},
	Trans: ({ i18nKey }: { i18nKey: string }) => <>{i18nKey}</>,
}))

type MockChatTextAreaProps = {
	inputValue?: string
	selectedImages?: string[]
	setInputValue: (value: string) => void
	setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>
}

let lastChatTextAreaProps: MockChatTextAreaProps | undefined

vi.mock("../ChatTextArea", () => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const mockReact = require("react")

	const ChatTextAreaComponent = mockReact.forwardRef(function MockChatTextArea(
		props: MockChatTextAreaProps,
		ref: React.ForwardedRef<{ focus: () => void }>,
	) {
		lastChatTextAreaProps = props
		mockReact.useImperativeHandle(ref, () => ({
			focus: vi.fn(),
		}))
		return <div data-testid="chat-textarea" />
	})

	return {
		default: ChatTextAreaComponent,
		ChatTextArea: ChatTextAreaComponent,
	}
})

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

const hydrateState = (state: Record<string, unknown>) => {
	window.dispatchEvent(
		new MessageEvent("message", {
			data: {
				type: "state",
				state: {
					version: "1.0.0",
					clineMessages: [],
					taskHistory: [],
					shouldShowAnnouncement: false,
					cloudIsAuthenticated: false,
					telemetrySetting: "enabled",
					mode: "code",
					customModes: [],
					messageQueue: [],
					organizationAllowList: { allowAll: true, providers: {} },
					apiConfiguration: { apiProvider: "anthropic" },
					...state,
				},
			},
		}),
	)
}

const sendExtensionMessage = (data: unknown) => {
	window.dispatchEvent(new MessageEvent("message", { data }))
}

describe("ChatView - draftMessage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		lastChatTextAreaProps = undefined
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it("requests a saved draft on mount", async () => {
		renderChatView()
		hydrateState({})
		await waitFor(() => {
			expect(vscode.postMessage).toHaveBeenCalledWith({ type: "getDraftMessage" })
		})
	})

	it("restores draft into an empty composer", async () => {
		renderChatView()
		hydrateState({})
		await act(async () => {
			sendExtensionMessage({
				type: "draftMessage",
				text: "hello",
				images: ["data:image/png;base64,abc"],
			})
		})
		await waitFor(() => {
			expect(lastChatTextAreaProps?.inputValue).toBe("hello")
			expect(lastChatTextAreaProps?.selectedImages).toEqual(["data:image/png;base64,abc"])
		})
	})

	it("does not overwrite non-empty composer when draftMessage arrives", async () => {
		renderChatView()
		hydrateState({})
		await waitFor(() => {
			expect(lastChatTextAreaProps).toBeDefined()
		})
		await act(async () => {
			lastChatTextAreaProps?.setInputValue("keep")
		})
		await waitFor(() => {
			expect(lastChatTextAreaProps?.inputValue).toBe("keep")
		})
		await act(async () => {
			sendExtensionMessage({
				type: "draftMessage",
				text: "overwrite?",
				images: ["data:image/png;base64,zzz"],
			})
		})
		await waitFor(() => {
			expect(lastChatTextAreaProps?.inputValue).toBe("keep")
		})
	})

	it("saves draft when images change after hydration", async () => {
		vi.useFakeTimers()
		renderChatView()
		hydrateState({})

		await act(async () => {
			await Promise.resolve()
		})
		expect(vscode.postMessage).toHaveBeenCalledWith({ type: "getDraftMessage" })

		// Mark hydration complete
		await act(async () => {
			sendExtensionMessage({
				type: "draftMessage",
				text: "",
				images: [],
			})
		})
		expect(lastChatTextAreaProps).toBeDefined()

		// Change images only
		vi.clearAllMocks()
		await act(async () => {
			lastChatTextAreaProps?.setSelectedImages(["data:image/png;base64,img1"])
		})
		await act(async () => {
			vi.advanceTimersByTime(600)
		})
		expect(vscode.postMessage).toHaveBeenCalledWith({
			type: "saveDraftMessage",
			text: "",
			images: ["data:image/png;base64,img1"],
		})
	})
})
