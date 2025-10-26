import { render, fireEvent, screen } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach } from "vitest"
import { ChatTextArea } from "../ChatTextArea"
import React from "react"

// Mock the Mode type
const mockMode = "code"

// Mock dependencies
vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		filePaths: [],
		openedTabs: [],
		currentApiConfigName: "test-config",
		listApiConfigMeta: [{ name: "test-config", id: "test-id" }],
		customModes: [],
		customModePrompts: {},
		cwd: "/test",
		pinnedApiConfigs: {},
		togglePinnedApiConfig: vi.fn(),
		taskHistory: [],
		clineMessages: [],
		commands: [],
		cloudUserInfo: null,
	}),
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: { [key: string]: string } = {
				"chat:quotePreview": "Quote",
				"chat:enhancePrompt": "Enhance prompt",
				"chat:addImages": "Add images",
				"chat:sendMessage": "Send message",
				"chat:selectMode": "Select mode",
				"chat:selectApiConfig": "Select API config",
				"chat:addContext": "Add context",
				"chat:dragFiles": "drag files",
				"chat:dragFilesImages": "drag files and images",
			}
			return translations[key] || key
		},
	}),
}))

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

vi.mock("@roo/modes", () => ({
	getAllModes: () => [],
}))

// Mock additional components
vi.mock("../ModeSelector", () => ({
	ModeSelector: () => <div>Mode Selector</div>,
}))

vi.mock("../ApiConfigSelector", () => ({
	ApiConfigSelector: () => <div>API Config Selector</div>,
}))

vi.mock("../AutoApproveDropdown", () => ({
	AutoApproveDropdown: () => <div>Auto Approve Dropdown</div>,
}))

vi.mock("../IndexingStatusBadge", () => ({
	IndexingStatusBadge: () => <div>Indexing Status Badge</div>,
}))

vi.mock("../../cloud/CloudAccountSwitcher", () => ({
	CloudAccountSwitcher: () => <div>Cloud Account Switcher</div>,
}))

vi.mock("../../../components/common/Thumbnails", () => ({
	default: () => <div>Thumbnails</div>,
}))

describe("ChatTextArea Quote Preview", () => {
	const mockSetInputValue = vi.fn()
	const mockOnSend = vi.fn()
	const mockOnClearQuote = vi.fn()
	const mockSetSelectedImages = vi.fn()
	const mockOnSelectImages = vi.fn()
	const mockSetMode = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should display quote preview when quotedText is provided", () => {
		const quotedText = "This is a quoted message"

		render(
			<ChatTextArea
				inputValue=""
				quotedText={quotedText}
				setInputValue={mockSetInputValue}
				sendingDisabled={false}
				selectApiConfigDisabled={false}
				placeholderText="Type your task here"
				selectedImages={[]}
				setSelectedImages={mockSetSelectedImages}
				onSend={mockOnSend}
				onSelectImages={mockOnSelectImages}
				shouldDisableImages={false}
				mode={mockMode as any}
				setMode={mockSetMode}
				modeShortcutText="Ctrl+M"
				onClearQuote={mockOnClearQuote}
			/>,
		)

		// Check if quote preview is displayed
		expect(screen.getByText("Quote")).toBeInTheDocument()
		expect(screen.getByText(quotedText)).toBeInTheDocument()
	})

	it("should not display quote preview when quotedText is empty", () => {
		render(
			<ChatTextArea
				inputValue=""
				quotedText=""
				setInputValue={mockSetInputValue}
				sendingDisabled={false}
				selectApiConfigDisabled={false}
				placeholderText="Type your task here"
				selectedImages={[]}
				setSelectedImages={mockSetSelectedImages}
				onSend={mockOnSend}
				onSelectImages={mockOnSelectImages}
				shouldDisableImages={false}
				mode={mockMode as any}
				setMode={mockSetMode}
				modeShortcutText="Ctrl+M"
				onClearQuote={mockOnClearQuote}
			/>,
		)

		// Check that quote preview is not displayed
		expect(screen.queryByText("Quote")).not.toBeInTheDocument()
	})

	it("should call onClearQuote when dismiss button is clicked", () => {
		const quotedText = "This is a quoted message"

		const { container } = render(
			<ChatTextArea
				inputValue=""
				quotedText={quotedText}
				setInputValue={mockSetInputValue}
				sendingDisabled={false}
				selectApiConfigDisabled={false}
				placeholderText="Type your task here"
				selectedImages={[]}
				setSelectedImages={mockSetSelectedImages}
				onSend={mockOnSend}
				onSelectImages={mockOnSelectImages}
				shouldDisableImages={false}
				mode={mockMode as any}
				setMode={mockSetMode}
				modeShortcutText="Ctrl+M"
				onClearQuote={mockOnClearQuote}
			/>,
		)

		// Find and click the dismiss button
		const dismissButton = container.querySelector('[aria-label="Clear quote"]')
		expect(dismissButton).toBeInTheDocument()
		fireEvent.click(dismissButton!)

		// Check that onClearQuote was called
		expect(mockOnClearQuote).toHaveBeenCalledTimes(1)
	})

	it("should truncate long quoted text", () => {
		const longQuotedText = "a".repeat(250) // 250 characters

		render(
			<ChatTextArea
				inputValue=""
				quotedText={longQuotedText}
				setInputValue={mockSetInputValue}
				sendingDisabled={false}
				selectApiConfigDisabled={false}
				placeholderText="Type your task here"
				selectedImages={[]}
				setSelectedImages={mockSetSelectedImages}
				onSend={mockOnSend}
				onSelectImages={mockOnSelectImages}
				shouldDisableImages={false}
				mode={mockMode as any}
				setMode={mockSetMode}
				modeShortcutText="Ctrl+M"
				onClearQuote={mockOnClearQuote}
			/>,
		)

		// Check that the text is truncated
		const displayedText = screen.getByText(/^a+\.\.\./)
		expect(displayedText.textContent).toContain("...")
		expect(displayedText.textContent!.length).toBeLessThan(250)
	})
})
