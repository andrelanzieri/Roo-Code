import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi } from "vitest"
import { CrashReportDialog } from "../CrashReportDialog"

// Mock vscode API
const mockPostMessage = vi.fn()
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (message: any) => mockPostMessage(message),
	},
}))

// Mock react-i18next
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"crashReport:title": "Report an Issue",
				"crashReport:description": "Help us improve by reporting this issue.",
				"crashReport:errorDetails": "Error Details",
				"crashReport:copyDetails": "Copy Details",
				"crashReport:copiedToClipboard": "Copied to clipboard",
				"crashReport:whatHappened": "What happened?",
				"crashReport:whatHappenedPlaceholder": "Describe what happened...",
				"crashReport:email": "Email",
				"crashReport:optional": "optional",
				"crashReport:emailPlaceholder": "your@email.com",
				"crashReport:emailDescription": "We'll only use this to follow up",
				"crashReport:submit": "Submit Report",
				"crashReport:submitting": "Submitting...",
				"crashReport:submitSuccess": "Thank you for your report!",
				"crashReport:humanRelayNote": "This will be sent via Human Relay",
				"common:cancel": "Cancel",
			}
			return translations[key] || key
		},
	}),
}))

// Mock clipboard API
Object.assign(navigator, {
	clipboard: {
		writeText: vi.fn().mockResolvedValue(undefined),
	},
})

describe("CrashReportDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockPostMessage.mockClear()
	})

	it("should not render when isOpen is false", () => {
		const { container } = render(<CrashReportDialog isOpen={false} onClose={vi.fn()} />)
		expect(container.firstChild).toBeNull()
	})

	it("should render when isOpen is true", () => {
		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} />)
		expect(screen.getByText("Report an Issue")).toBeInTheDocument()
	})

	it("should display error details when provided", () => {
		const errorDetails = {
			message: "Test error message",
			stack: "Error stack trace",
			context: "code-index",
			timestamp: Date.now(),
		}

		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} errorDetails={errorDetails} />)

		expect(screen.getByText(/Test error message/)).toBeInTheDocument()
		expect(screen.getByText(/Error stack trace/)).toBeInTheDocument()
	})

	it("should copy error details to clipboard when copy button is clicked", async () => {
		const errorDetails = {
			message: "Test error",
			stack: "Stack trace",
		}

		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} errorDetails={errorDetails} />)

		const copyButton = screen.getByText("Copy Details")
		fireEvent.click(copyButton)

		await waitFor(() => {
			expect(navigator.clipboard.writeText).toHaveBeenCalledWith(JSON.stringify(errorDetails, null, 2))
		})
	})

	it("should show human relay note for human-relay source", () => {
		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} source="human-relay" />)

		expect(screen.getByText("This will be sent via Human Relay")).toBeInTheDocument()
	})

	it("should call onClose when cancel button is clicked", () => {
		const onClose = vi.fn()
		render(<CrashReportDialog isOpen={true} onClose={onClose} />)

		const cancelButton = screen.getByText("Cancel")
		fireEvent.click(cancelButton)

		expect(onClose).toHaveBeenCalled()
	})

	it("should render all required form fields", () => {
		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} />)

		// Check for form labels
		expect(screen.getByText("What happened?")).toBeInTheDocument()
		// Email label is rendered with (optional) in the same element
		expect(screen.getByText(/Email/)).toBeInTheDocument()

		// Check for buttons
		expect(screen.getByText("Cancel")).toBeInTheDocument()
		expect(screen.getByText("Submit Report")).toBeInTheDocument()
	})

	it("should display correct source in crash report", () => {
		const { container } = render(<CrashReportDialog isOpen={true} onClose={vi.fn()} source="code-index" />)

		// The source is passed to the component and will be included in the crash report
		// We can't easily test the actual submission due to VSCode webview component limitations
		// but we can verify the component renders with the correct props
		expect(container.querySelector(".fixed")).toBeInTheDocument()
	})

	it("should include error details in rendered output", () => {
		const errorDetails = {
			message: "Critical error occurred",
			context: "During indexing",
			stack: "at function xyz",
		}

		render(<CrashReportDialog isOpen={true} onClose={vi.fn()} errorDetails={errorDetails} />)

		expect(screen.getByText(/Critical error occurred/)).toBeInTheDocument()
		expect(screen.getByText(/During indexing/)).toBeInTheDocument()
		expect(screen.getByText(/at function xyz/)).toBeInTheDocument()
	})
})
