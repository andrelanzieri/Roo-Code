import { renderHook, act } from "@/utils/test-utils"
import * as path from "path"
import * as os from "os"

import type { HistoryItem } from "@roo-code/types"

import { useTaskSearch } from "../useTaskSearch"

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: vi.fn(),
}))

vi.mock("@/utils/highlight", () => ({
	highlightFzfMatch: vi.fn((text) => `<mark>${text}</mark>`),
}))

import { useExtensionState } from "@/context/ExtensionStateContext"

const mockUseExtensionState = useExtensionState as ReturnType<typeof vi.fn>

const mockTaskHistory: HistoryItem[] = [
	{
		id: "task-1",
		number: 1,
		task: "Create a React component",
		ts: new Date("2022-02-16T12:00:00").getTime(),
		tokensIn: 100,
		tokensOut: 50,
		totalCost: 0.01,
		workspace: "/workspace/project1",
	},
	{
		id: "task-2",
		number: 2,
		task: "Write unit tests",
		ts: new Date("2022-02-17T12:00:00").getTime(),
		tokensIn: 200,
		tokensOut: 100,
		totalCost: 0.02,
		cacheWrites: 25,
		cacheReads: 10,
		workspace: "/workspace/project1",
	},
	{
		id: "task-3",
		number: 3,
		task: "Fix bug in authentication",
		ts: new Date("2022-02-15T12:00:00").getTime(),
		tokensIn: 150,
		tokensOut: 75,
		totalCost: 0.05,
		workspace: "/workspace/project2",
	},
]

describe("useTaskSearch", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockUseExtensionState.mockReturnValue({
			taskHistory: mockTaskHistory,
			cwd: "/workspace/project1",
		} as any)
	})

	it("returns all tasks by default", () => {
		const { result } = renderHook(() => useTaskSearch())

		expect(result.current.tasks).toHaveLength(2) // Only tasks from current workspace
		expect(result.current.tasks[0].id).toBe("task-2") // Newest first
		expect(result.current.tasks[1].id).toBe("task-1")
	})

	it("filters tasks by current workspace by default", () => {
		const { result } = renderHook(() => useTaskSearch())

		expect(result.current.tasks).toHaveLength(2)
		expect(result.current.tasks.every((task) => task.workspace === "/workspace/project1")).toBe(true)
	})

	it("shows all workspaces when showAllWorkspaces is true", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
		})

		expect(result.current.tasks).toHaveLength(3)
		expect(result.current.showAllWorkspaces).toBe(true)
	})

	it("sorts by newest by default", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
		})

		expect(result.current.sortOption).toBe("newest")
		expect(result.current.tasks[0].id).toBe("task-2") // Feb 17
		expect(result.current.tasks[1].id).toBe("task-1") // Feb 16
		expect(result.current.tasks[2].id).toBe("task-3") // Feb 15
	})

	it("sorts by oldest", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSortOption("oldest")
		})

		expect(result.current.tasks[0].id).toBe("task-3") // Feb 15
		expect(result.current.tasks[1].id).toBe("task-1") // Feb 16
		expect(result.current.tasks[2].id).toBe("task-2") // Feb 17
	})

	it("sorts by most expensive", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSortOption("mostExpensive")
		})

		expect(result.current.tasks[0].id).toBe("task-3") // $0.05
		expect(result.current.tasks[1].id).toBe("task-2") // $0.02
		expect(result.current.tasks[2].id).toBe("task-1") // $0.01
	})

	it("sorts by most tokens", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSortOption("mostTokens")
		})

		// task-2: 200 + 100 + 25 + 10 = 335 tokens
		// task-3: 150 + 75 = 225 tokens
		// task-1: 100 + 50 = 150 tokens
		expect(result.current.tasks[0].id).toBe("task-2")
		expect(result.current.tasks[1].id).toBe("task-3")
		expect(result.current.tasks[2].id).toBe("task-1")
	})

	it("filters tasks by search query", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSearchQuery("React")
		})

		expect(result.current.tasks).toHaveLength(1)
		expect(result.current.tasks[0].id).toBe("task-1")
		expect((result.current.tasks[0] as any).highlight).toBe("<mark>Create a React component</mark>")
	})

	it("automatically switches to mostRelevant when searching", () => {
		const { result } = renderHook(() => useTaskSearch())

		// Initially lastNonRelevantSort should be "newest" (the default)
		expect(result.current.lastNonRelevantSort).toBe("newest")

		act(() => {
			result.current.setSortOption("oldest")
		})

		expect(result.current.sortOption).toBe("oldest")

		// Clear lastNonRelevantSort to test the auto-switch behavior
		act(() => {
			result.current.setLastNonRelevantSort(null)
		})

		act(() => {
			result.current.setSearchQuery("test")
		})

		// The hook should automatically switch to mostRelevant when there's a search query
		// and the current sort is not mostRelevant and lastNonRelevantSort is null
		expect(result.current.sortOption).toBe("mostRelevant")
		expect(result.current.lastNonRelevantSort).toBe("oldest")
	})

	it("restores previous sort when clearing search", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setSortOption("mostExpensive")
		})

		expect(result.current.sortOption).toBe("mostExpensive")

		// Clear lastNonRelevantSort to enable the auto-switch behavior
		act(() => {
			result.current.setLastNonRelevantSort(null)
		})

		act(() => {
			result.current.setSearchQuery("test")
		})

		expect(result.current.sortOption).toBe("mostRelevant")
		expect(result.current.lastNonRelevantSort).toBe("mostExpensive")

		act(() => {
			result.current.setSearchQuery("")
		})

		expect(result.current.sortOption).toBe("mostExpensive")
		expect(result.current.lastNonRelevantSort).toBe(null)
	})

	it("handles empty task history", () => {
		mockUseExtensionState.mockReturnValue({
			taskHistory: [],
			cwd: "/workspace/project1",
		} as any)

		const { result } = renderHook(() => useTaskSearch())

		expect(result.current.tasks).toHaveLength(0)
	})

	it("filters out tasks without timestamp or task content", () => {
		const incompleteTaskHistory = [
			...mockTaskHistory,
			{
				id: "incomplete-1",
				number: 4,
				task: "",
				ts: Date.now(),
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
			},
			{
				id: "incomplete-2",
				number: 5,
				task: "Valid task",
				ts: 0,
				tokensIn: 0,
				tokensOut: 0,
				totalCost: 0,
			},
		] as HistoryItem[]

		mockUseExtensionState.mockReturnValue({
			taskHistory: incompleteTaskHistory,
			cwd: "/workspace/project1",
		} as any)

		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
		})

		// Should only include tasks with both ts and task content
		expect(result.current.tasks).toHaveLength(3)
		expect(result.current.tasks.every((task) => task.ts && task.task)).toBe(true)
	})

	it("handles search with no results", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSearchQuery("nonexistent")
		})

		expect(result.current.tasks).toHaveLength(0)
	})

	it("preserves search results order when using mostRelevant sort", () => {
		const { result } = renderHook(() => useTaskSearch())

		act(() => {
			result.current.setShowAllWorkspaces(true)
			result.current.setSearchQuery("test")
			result.current.setSortOption("mostRelevant")
		})

		// When searching, mostRelevant should preserve fzf order
		// When not searching, it should fall back to newest
		expect(result.current.sortOption).toBe("mostRelevant")
	})

	describe("Desktop directory handling", () => {
		it("should correctly filter tasks when workspace is Desktop on macOS", () => {
			const desktopPath = path.join(os.homedir(), "Desktop")
			const desktopPathWithSlash = path.join(os.homedir(), "Desktop/")

			const desktopTaskHistory: HistoryItem[] = [
				{
					id: "desktop-task-1",
					number: 1,
					task: "Task created in Desktop",
					ts: new Date("2022-02-16T12:00:00").getTime(),
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: desktopPath,
				},
				{
					id: "desktop-task-2",
					number: 2,
					task: "Another Desktop task",
					ts: new Date("2022-02-17T12:00:00").getTime(),
					tokensIn: 200,
					tokensOut: 100,
					totalCost: 0.02,
					workspace: desktopPathWithSlash, // With trailing slash
				},
				{
					id: "other-task",
					number: 3,
					task: "Task from different workspace",
					ts: new Date("2022-02-15T12:00:00").getTime(),
					tokensIn: 150,
					tokensOut: 75,
					totalCost: 0.05,
					workspace: "/workspace/project1",
				},
			]

			mockUseExtensionState.mockReturnValue({
				taskHistory: desktopTaskHistory,
				cwd: desktopPath,
			} as any)

			const { result } = renderHook(() => useTaskSearch())

			// Should show both Desktop tasks despite different path formats
			expect(result.current.tasks).toHaveLength(2)
			expect(result.current.tasks[0].id).toBe("desktop-task-2")
			expect(result.current.tasks[1].id).toBe("desktop-task-1")
		})

		it("should handle Desktop path variations on Windows", () => {
			// Mock Windows platform
			const originalPlatform = process.platform
			Object.defineProperty(process, "platform", {
				value: "win32",
				configurable: true,
			})

			const desktopPath = "C:\\Users\\testuser\\Desktop"
			const desktopPathMixed = "C:/Users/testuser/Desktop"
			const desktopPathLowerCase = "c:\\users\\testuser\\desktop"

			const windowsDesktopTaskHistory: HistoryItem[] = [
				{
					id: "win-desktop-task-1",
					number: 1,
					task: "Windows Desktop task 1",
					ts: new Date("2022-02-16T12:00:00").getTime(),
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: desktopPath,
				},
				{
					id: "win-desktop-task-2",
					number: 2,
					task: "Windows Desktop task 2",
					ts: new Date("2022-02-17T12:00:00").getTime(),
					tokensIn: 200,
					tokensOut: 100,
					totalCost: 0.02,
					workspace: desktopPathMixed, // Mixed separators
				},
				{
					id: "win-desktop-task-3",
					number: 3,
					task: "Windows Desktop task 3",
					ts: new Date("2022-02-18T12:00:00").getTime(),
					tokensIn: 150,
					tokensOut: 75,
					totalCost: 0.03,
					workspace: desktopPathLowerCase, // Different case
				},
			]

			mockUseExtensionState.mockReturnValue({
				taskHistory: windowsDesktopTaskHistory,
				cwd: desktopPath,
			} as any)

			const { result } = renderHook(() => useTaskSearch())

			// Should show all Desktop tasks despite path variations
			expect(result.current.tasks).toHaveLength(3)
			expect(result.current.tasks[0].id).toBe("win-desktop-task-3")
			expect(result.current.tasks[1].id).toBe("win-desktop-task-2")
			expect(result.current.tasks[2].id).toBe("win-desktop-task-1")

			// Restore original platform
			Object.defineProperty(process, "platform", {
				value: originalPlatform,
				configurable: true,
			})
		})

		it("should not lose tasks when switching between panels with Desktop workspace", () => {
			const desktopPath = path.join(os.homedir(), "Desktop")

			const desktopTaskHistory: HistoryItem[] = [
				{
					id: "persistent-task-1",
					number: 1,
					task: "Task that should persist",
					ts: new Date("2022-02-16T12:00:00").getTime(),
					tokensIn: 100,
					tokensOut: 50,
					totalCost: 0.01,
					workspace: desktopPath,
				},
			]

			// Initial render - tasks should be visible
			mockUseExtensionState.mockReturnValue({
				taskHistory: desktopTaskHistory,
				cwd: desktopPath,
			} as any)

			const { result, rerender } = renderHook(() => useTaskSearch())

			expect(result.current.tasks).toHaveLength(1)
			expect(result.current.tasks[0].id).toBe("persistent-task-1")

			// Simulate switching panels (component remount)
			rerender()

			// Tasks should still be visible after remount
			expect(result.current.tasks).toHaveLength(1)
			expect(result.current.tasks[0].id).toBe("persistent-task-1")
		})
	})
})
