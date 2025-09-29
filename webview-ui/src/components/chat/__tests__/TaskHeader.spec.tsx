// npx vitest src/components/chat/__tests__/TaskHeader.spec.tsx

import React from "react"
import { render, screen, fireEvent } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

import type { ProviderSettings } from "@roo-code/types"

import TaskHeader, { TaskHeaderProps } from "../TaskHeader"

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key, // Simple mock that returns the key
	}),
	// Mock initReactI18next to prevent initialization errors in tests
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
}))

// Mock the vscode API
vi.mock("@/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

// Mock the VSCodeBadge component
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeBadge: ({ children }: { children: React.ReactNode }) => <div data-testid="vscode-badge">{children}</div>,
}))

// Create a variable to hold the mock state
let mockExtensionState: {
	apiConfiguration: ProviderSettings
	currentTaskItem: { id: string; title?: string } | null
	clineMessages: any[]
} = {
	apiConfiguration: {
		apiProvider: "anthropic",
		apiKey: "test-api-key",
		apiModelId: "claude-3-opus-20240229",
	} as ProviderSettings,
	currentTaskItem: { id: "test-task-id" },
	clineMessages: [],
}

// Mock the ExtensionStateContext
vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => mockExtensionState,
}))

// Mock the useCloudUpsell hook
vi.mock("@src/hooks/useCloudUpsell", () => ({
	useCloudUpsell: () => ({
		isOpen: false,
		openUpsell: vi.fn(),
		closeUpsell: vi.fn(),
		handleConnect: vi.fn(),
	}),
}))

// Mock DismissibleUpsell component
vi.mock("@src/components/common/DismissibleUpsell", () => ({
	default: ({ children, ...props }: any) => (
		<div data-testid="dismissible-upsell" {...props}>
			{children}
		</div>
	),
}))

// Mock CloudUpsellDialog component
vi.mock("@src/components/cloud/CloudUpsellDialog", () => ({
	CloudUpsellDialog: () => null,
}))

// Mock findLastIndex from @roo/array
vi.mock("@roo/array", () => ({
	findLastIndex: (array: any[], predicate: (item: any) => boolean) => {
		for (let i = array.length - 1; i >= 0; i--) {
			if (predicate(array[i])) {
				return i
			}
		}
		return -1
	},
}))

describe("TaskHeader", () => {
	const defaultProps: TaskHeaderProps = {
		task: { type: "say", ts: Date.now(), text: "Test task", images: [] },
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.05,
		contextTokens: 200,
		buttonsDisabled: false,
		handleCondenseContext: vi.fn(),
	}

	const queryClient = new QueryClient()

	const renderTaskHeader = (props: Partial<TaskHeaderProps> = {}) => {
		return render(
			<QueryClientProvider client={queryClient}>
				<TaskHeader {...defaultProps} {...props} />
			</QueryClientProvider>,
		)
	}

	it("should display cost when totalCost is greater than 0", () => {
		renderTaskHeader()
		expect(screen.getByText("$0.05")).toBeInTheDocument()
	})

	it("should not display cost when totalCost is 0", () => {
		renderTaskHeader({ totalCost: 0 })
		expect(screen.queryByText("$0.0000")).not.toBeInTheDocument()
	})

	it("should not display cost when totalCost is null", () => {
		renderTaskHeader({ totalCost: null as any })
		expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
	})

	it("should not display cost when totalCost is undefined", () => {
		renderTaskHeader({ totalCost: undefined as any })
		expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
	})

	it("should not display cost when totalCost is NaN", () => {
		renderTaskHeader({ totalCost: NaN })
		expect(screen.queryByText(/\$/)).not.toBeInTheDocument()
	})

	it("should render the condense context button when expanded", () => {
		renderTaskHeader()
		// First click to expand the task header
		const taskHeader = screen.getByText("Test task")
		fireEvent.click(taskHeader)

		// Now find the condense button in the expanded state
		const buttons = screen.getAllByRole("button")
		const condenseButton = buttons.find((button) => button.querySelector("svg.lucide-fold-vertical"))
		expect(condenseButton).toBeDefined()
		expect(condenseButton?.querySelector("svg")).toBeInTheDocument()
	})

	it("should call handleCondenseContext when condense context button is clicked", () => {
		const handleCondenseContext = vi.fn()
		renderTaskHeader({ handleCondenseContext })

		// First click to expand the task header
		const taskHeader = screen.getByText("Test task")
		fireEvent.click(taskHeader)

		// Find the button that contains the FoldVertical icon
		const buttons = screen.getAllByRole("button")
		const condenseButton = buttons.find((button) => button.querySelector("svg.lucide-fold-vertical"))
		expect(condenseButton).toBeDefined()
		fireEvent.click(condenseButton!)
		expect(handleCondenseContext).toHaveBeenCalledWith("test-task-id")
	})

	it("should disable the condense context button when buttonsDisabled is true", () => {
		const handleCondenseContext = vi.fn()
		renderTaskHeader({ buttonsDisabled: true, handleCondenseContext })

		// First click to expand the task header
		const taskHeader = screen.getByText("Test task")
		fireEvent.click(taskHeader)

		// Find the button that contains the FoldVertical icon
		const buttons = screen.getAllByRole("button")
		const condenseButton = buttons.find((button) => button.querySelector("svg.lucide-fold-vertical"))
		expect(condenseButton).toBeDefined()
		expect(condenseButton).toBeDisabled()
		fireEvent.click(condenseButton!)
		expect(handleCondenseContext).not.toHaveBeenCalled()
	})

	describe("DismissibleUpsell behavior", () => {
		beforeEach(() => {
			vi.useFakeTimers()
			// Reset the mock state before each test
			mockExtensionState = {
				apiConfiguration: {
					apiProvider: "anthropic",
					apiKey: "test-api-key",
					apiModelId: "claude-3-opus-20240229",
				} as ProviderSettings,
				currentTaskItem: { id: "test-task-id" },
				clineMessages: [],
			}
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		it("should show DismissibleUpsell after 2 minutes when task is not complete", async () => {
			renderTaskHeader()

			// Initially, the upsell should not be visible
			expect(screen.queryByTestId("dismissible-upsell")).not.toBeInTheDocument()

			// Fast-forward time by 2 minutes to match component timeout
			await vi.advanceTimersByTimeAsync(120_000)

			// The upsell should now be visible
			expect(screen.getByTestId("dismissible-upsell")).toBeInTheDocument()
			expect(screen.getByText("cloud:upsell.longRunningTask")).toBeInTheDocument()
		})

		it("should not show DismissibleUpsell when task is complete", async () => {
			// Set up mock state with a completion_result message
			mockExtensionState = {
				...mockExtensionState,
				clineMessages: [
					{
						type: "ask",
						ask: "completion_result",
						ts: Date.now(),
						text: "Task completed!",
					},
				],
			}

			renderTaskHeader()

			// Fast-forward time by more than 2 minutes
			await vi.advanceTimersByTimeAsync(130_000)

			// The upsell should not appear
			expect(screen.queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		})

		it("should not show DismissibleUpsell when currentTaskItem is null", async () => {
			// Update the mock state to have null currentTaskItem
			mockExtensionState = {
				...mockExtensionState,
				currentTaskItem: null,
			}

			renderTaskHeader()

			// Fast-forward time by more than 2 minutes
			await vi.advanceTimersByTimeAsync(130_000)

			// The upsell should not appear
			expect(screen.queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		})

		it("should not show DismissibleUpsell when task has completion_result in clineMessages", async () => {
			// Set up mock state with a completion_result message from the start
			mockExtensionState = {
				...mockExtensionState,
				clineMessages: [
					{
						type: "say",
						say: "text",
						ts: Date.now() - 1000,
						text: "Working on task...",
					},
					{
						type: "ask",
						ask: "completion_result",
						ts: Date.now(),
						text: "Task completed!",
					},
				],
			}

			renderTaskHeader()

			// Fast-forward time by more than 2 minutes
			await vi.advanceTimersByTimeAsync(130_000)

			// The upsell should not appear because the task is complete
			expect(screen.queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		})

		it("should not show DismissibleUpsell when task has completion_result followed by resume messages", async () => {
			// Set up mock state with a completion_result message followed by resume messages
			mockExtensionState = {
				...mockExtensionState,
				clineMessages: [
					{
						type: "say",
						say: "text",
						ts: Date.now() - 3000,
						text: "Working on task...",
					},
					{
						type: "ask",
						ask: "completion_result",
						ts: Date.now() - 2000,
						text: "Task completed!",
					},
					{
						type: "ask",
						ask: "resume_completed_task",
						ts: Date.now() - 1000,
						text: "Resume completed task?",
					},
					{
						type: "ask",
						ask: "resume_task",
						ts: Date.now(),
						text: "Resume task?",
					},
				],
			}

			renderTaskHeader()

			// Fast-forward time by more than 2 minutes
			await vi.advanceTimersByTimeAsync(130_000)

			// The upsell should not appear because the last relevant message (skipping resume messages) is completion_result
			expect(screen.queryByTestId("dismissible-upsell")).not.toBeInTheDocument()
		})

		it("should show DismissibleUpsell when task has non-completion message followed by resume messages", async () => {
			// Set up mock state with a non-completion message followed by resume messages
			mockExtensionState = {
				...mockExtensionState,
				clineMessages: [
					{
						type: "say",
						say: "text",
						ts: Date.now() - 3000,
						text: "Working on task...",
					},
					{
						type: "ask",
						ask: "tool",
						ts: Date.now() - 2000,
						text: "Need permission to use tool",
					},
					{
						type: "ask",
						ask: "resume_task",
						ts: Date.now() - 1000,
						text: "Resume task?",
					},
				],
			}

			renderTaskHeader()

			// Fast-forward time by 2 minutes to trigger the upsell
			await vi.advanceTimersByTimeAsync(120_000)

			// The upsell should appear because the last relevant message (skipping resume messages) is not completion_result
			expect(screen.getByTestId("dismissible-upsell")).toBeInTheDocument()
		})
	})

	describe("Title editing functionality", () => {
		beforeEach(() => {
			// Reset the mock state before each test
			mockExtensionState = {
				apiConfiguration: {
					apiProvider: "anthropic",
					apiKey: "test-api-key",
					apiModelId: "claude-3-opus-20240229",
				} as ProviderSettings,
				currentTaskItem: { id: "test-task-id", title: "Existing Title" },
				clineMessages: [],
			}
			// Clear mock calls
			vi.clearAllMocks()
		})

		it("should display the title if it exists", () => {
			renderTaskHeader()
			expect(screen.getByText("Existing Title")).toBeInTheDocument()
		})

		it("should display task text when no title exists", () => {
			mockExtensionState.currentTaskItem = { id: "test-task-id" }
			renderTaskHeader()
			expect(screen.getByText("Test task")).toBeInTheDocument()
		})

		it("should show edit button when hovering over title", () => {
			renderTaskHeader()
			const titleElement = screen.getByText("Existing Title")

			// Initially, edit button should not be visible
			expect(screen.queryByLabelText("chat:editTitle")).not.toBeInTheDocument()

			// Hover over the title
			fireEvent.mouseEnter(titleElement.parentElement!)

			// Edit button should now be visible
			expect(screen.getByLabelText("chat:editTitle")).toBeInTheDocument()
		})

		it("should enter edit mode when edit button is clicked", () => {
			renderTaskHeader()
			const titleElement = screen.getByText("Existing Title")

			// Hover and click edit button
			fireEvent.mouseEnter(titleElement.parentElement!)
			const editButton = screen.getByLabelText("chat:editTitle")
			fireEvent.click(editButton)

			// Should show input field with current title
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			expect(input).toBeInTheDocument()
			expect(input.tagName).toBe("INPUT")

			// Should show save and cancel buttons
			expect(screen.getByLabelText("chat:saveTitle")).toBeInTheDocument()
			expect(screen.getByLabelText("chat:cancelEdit")).toBeInTheDocument()
		})

		it("should save title when save button is clicked", () => {
			const { vscode } = require("@/utils/vscode")
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Change the title
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "New Title" } })

			// Click save
			fireEvent.click(screen.getByLabelText("chat:saveTitle"))

			// Should post message to update title
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "updateTaskTitle",
				taskId: "test-task-id",
				title: "New Title",
			})
		})

		it("should cancel editing when cancel button is clicked", () => {
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Change the title
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "Changed Title" } })

			// Click cancel
			fireEvent.click(screen.getByLabelText("chat:cancelEdit"))

			// Should exit edit mode and show original title
			expect(screen.getByText("Existing Title")).toBeInTheDocument()
			expect(screen.queryByDisplayValue("Changed Title")).not.toBeInTheDocument()
		})

		it("should save title when Enter key is pressed", () => {
			const { vscode } = require("@/utils/vscode")
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Change the title and press Enter
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "Enter Key Title" } })
			fireEvent.keyDown(input, { key: "Enter" })

			// Should post message to update title
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "updateTaskTitle",
				taskId: "test-task-id",
				title: "Enter Key Title",
			})
		})

		it("should cancel editing when Escape key is pressed", () => {
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Change the title and press Escape
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "Escape Test" } })
			fireEvent.keyDown(input, { key: "Escape" })

			// Should exit edit mode and show original title
			expect(screen.getByText("Existing Title")).toBeInTheDocument()
			expect(screen.queryByDisplayValue("Escape Test")).not.toBeInTheDocument()
		})

		it("should clear title when empty string is saved", () => {
			const { vscode } = require("@/utils/vscode")
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Clear the title
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "" } })

			// Click save
			fireEvent.click(screen.getByLabelText("chat:saveTitle"))

			// Should post message with empty title
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "updateTaskTitle",
				taskId: "test-task-id",
				title: "",
			})
		})

		it("should show placeholder when no title exists and in edit mode", () => {
			mockExtensionState.currentTaskItem = { id: "test-task-id" }
			renderTaskHeader()

			// Enter edit mode
			const taskElement = screen.getByText("Test task")
			fireEvent.mouseEnter(taskElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Should show input with placeholder
			const input = screen.getByPlaceholderText("chat:titlePlaceholder") as HTMLInputElement
			expect(input).toBeInTheDocument()
			expect(input.value).toBe("")
		})

		it("should not show edit button when task is null", () => {
			mockExtensionState.currentTaskItem = null
			renderTaskHeader()

			const taskElement = screen.getByText("Test task")
			fireEvent.mouseEnter(taskElement.parentElement!)

			// Edit button should not be present
			expect(screen.queryByLabelText("chat:editTitle")).not.toBeInTheDocument()
		})

		it("should trim whitespace from saved title", () => {
			const { vscode } = require("@/utils/vscode")
			renderTaskHeader()

			// Enter edit mode
			const titleElement = screen.getByText("Existing Title")
			fireEvent.mouseEnter(titleElement.parentElement!)
			fireEvent.click(screen.getByLabelText("chat:editTitle"))

			// Add title with whitespace
			const input = screen.getByDisplayValue("Existing Title") as HTMLInputElement
			fireEvent.change(input, { target: { value: "  Trimmed Title  " } })

			// Click save
			fireEvent.click(screen.getByLabelText("chat:saveTitle"))

			// Should post message with trimmed title
			expect(vscode.postMessage).toHaveBeenCalledWith({
				type: "updateTaskTitle",
				taskId: "test-task-id",
				title: "Trimmed Title",
			})
		})
	})
})
