import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { TaskHistoryWarning } from "../TaskHistoryWarning"

vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, params?: any) => {
			const translations: Record<string, string> = {
				"chat:taskHistoryWarning.title": "High Task History",
				"chat:taskHistoryWarning.description": `You have ${params?.count || 0} tasks in your history. Consider cleaning up old tasks to improve performance.`,
				"chat:taskHistoryWarning.cleanupButton": "Clean up tasks older than 30 days",
				"chat:taskHistoryWarning.dismiss": "Dismiss",
				"chat:taskHistoryWarning.cleanupDialog.title": "Clean Up Old Tasks",
				"chat:taskHistoryWarning.cleanupDialog.description": `This will permanently delete all tasks older than 30 days (${params?.count || 0} tasks). This action cannot be undone.`,
				"chat:taskHistoryWarning.cleanupDialog.cancel": "Cancel",
				"chat:taskHistoryWarning.cleanupDialog.confirm": "Clean Up",
				"chat:taskHistoryWarning.cleanupSuccess": `Successfully deleted ${params?.count || 0} old tasks`,
				"chat:taskHistoryWarning.cleanupError": `Failed to clean up tasks: ${params?.error || "Unknown error"}`,
			}
			return translations[key] || key
		},
	}),
}))

const mockTaskHistory: any[] = []
const mockSetTaskHistory = vi.fn()

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		taskHistory: mockTaskHistory,
		setTaskHistory: mockSetTaskHistory,
	}),
}))

const mockPostMessage = vi.fn()
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: mockPostMessage,
	},
}))

const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
}
Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
	writable: true,
})

describe("TaskHistoryWarning", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		localStorageMock.getItem.mockReturnValue(null)
		mockTaskHistory.length = 0
	})

	it("should not render when task history is below threshold", () => {
		mockTaskHistory.push(...Array(999).fill({ id: "task" }))

		const { container } = render(<TaskHistoryWarning />)
		expect(container.firstChild).toBeNull()
	})

	it("should render warning when task history exceeds threshold", () => {
		mockTaskHistory.push(...Array(1001).fill({ id: "task" }))

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		expect(warningButton).toBeInTheDocument()
	})

	it("should not render if dismissed at current threshold", () => {
		mockTaskHistory.push(...Array(1500).fill({ id: "task" }))

		localStorageMock.getItem.mockReturnValue("1000")

		const { container } = render(<TaskHistoryWarning />)
		expect(container.firstChild).toBeNull()
	})

	it("should render if task count exceeds next threshold after dismissal", () => {
		mockTaskHistory.push(...Array(2001).fill({ id: "task" }))

		localStorageMock.getItem.mockReturnValue("1000")

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		expect(warningButton).toBeInTheDocument()
	})

	it("should show popover content when warning button is clicked", () => {
		mockTaskHistory.push(...Array(1001).fill({ id: "task" }))

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		expect(screen.getByText(/You have 1001 tasks in your history/)).toBeInTheDocument()
		expect(screen.getByText("Clean up tasks older than 30 days")).toBeInTheDocument()
		expect(screen.getByText("Dismiss")).toBeInTheDocument()
	})

	it("should dismiss warning and save to localStorage", () => {
		mockTaskHistory.push(...Array(1001).fill({ id: "task" }))

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		const dismissButton = screen.getByText("Dismiss")
		fireEvent.click(dismissButton)

		expect(localStorageMock.setItem).toHaveBeenCalledWith("taskHistoryWarningDismissedThreshold", "1000")
	})

	it("should show cleanup confirmation dialog when cleanup button is clicked", async () => {
		const now = Date.now()
		const oldDate = now - 31 * 24 * 60 * 60 * 1000
		const newDate = now - 10 * 24 * 60 * 60 * 1000

		mockTaskHistory.push(
			...Array(500).fill({ id: "old", ts: oldDate }),
			...Array(501).fill({ id: "new", ts: newDate }),
		)

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		const cleanupButton = screen.getByText("Clean up tasks older than 30 days")
		fireEvent.click(cleanupButton)

		await waitFor(() => {
			expect(screen.getByText("Clean Up Old Tasks")).toBeInTheDocument()
			expect(screen.getByText(/This will permanently delete all tasks older than 30 days/)).toBeInTheDocument()
		})
	})

	it("should call deleteMultipleTasksWithIds when cleanup is confirmed", async () => {
		const now = Date.now()
		const oldDate = now - 31 * 24 * 60 * 60 * 1000
		const newDate = now - 10 * 24 * 60 * 60 * 1000

		mockTaskHistory.push({ id: "old1", ts: oldDate }, { id: "old2", ts: oldDate }, { id: "new1", ts: newDate })

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		const cleanupButton = screen.getByText("Clean up tasks older than 30 days")
		fireEvent.click(cleanupButton)

		await waitFor(() => {
			const confirmButton = screen.getByRole("button", { name: "Clean Up" })
			fireEvent.click(confirmButton)
		})

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "deleteMultipleTasksWithIds",
			ids: ["old1", "old2"],
		})
	})

	it("should handle cleanup with no old tasks gracefully", async () => {
		const now = Date.now()
		const newDate = now - 10 * 24 * 60 * 60 * 1000

		mockTaskHistory.push(...Array(1001).fill({ id: "new", ts: newDate }))

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		const cleanupButton = screen.getByText("Clean up tasks older than 30 days")
		fireEvent.click(cleanupButton)

		await waitFor(() => {
			expect(screen.getByText(/\(0 tasks\)/)).toBeInTheDocument()
		})
	})

	it("should apply custom className when provided", () => {
		mockTaskHistory.push(...Array(1001).fill({ id: "task" }))

		const { container } = render(<TaskHistoryWarning className="custom-class" />)

		const wrapper = container.firstChild as HTMLElement
		expect(wrapper).toHaveClass("custom-class")
	})

	it("should handle tasks without timestamps", async () => {
		mockTaskHistory.push({ id: "no-ts-1" }, { id: "no-ts-2" }, ...Array(999).fill({ id: "task", ts: Date.now() }))

		render(<TaskHistoryWarning />)

		const warningButton = screen.getByRole("button", { name: /High Task History/i })
		fireEvent.click(warningButton)

		const cleanupButton = screen.getByText("Clean up tasks older than 30 days")
		fireEvent.click(cleanupButton)

		await waitFor(() => {
			const confirmButton = screen.getByRole("button", { name: "Clean Up" })
			fireEvent.click(confirmButton)
		})

		expect(mockPostMessage).toHaveBeenCalledWith({
			type: "deleteMultipleTasksWithIds",
			ids: expect.arrayContaining(["no-ts-1", "no-ts-2"]),
		})
	})
})
