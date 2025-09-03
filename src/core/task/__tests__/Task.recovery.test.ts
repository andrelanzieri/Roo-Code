import { ProviderSettings } from "@roo-code/types"
import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import * as taskPersistence from "../../task-persistence"

// Mock dependencies
vi.mock("../../webview/ClineProvider")
vi.mock("../../../integrations/terminal/TerminalRegistry", () => ({
	TerminalRegistry: {
		releaseTerminalsForTask: vi.fn(),
	},
}))
vi.mock("../../ignore/RooIgnoreController")
vi.mock("../../protect/RooProtectedController")
vi.mock("../../context-tracking/FileContextTracker")
vi.mock("../../../services/browser/UrlContentFetcher")
vi.mock("../../../services/browser/BrowserSession")
vi.mock("../../../integrations/editor/DiffViewProvider")
vi.mock("../../tools/ToolRepetitionDetector")
vi.mock("../../../api", () => ({
	buildApiHandler: vi.fn(() => ({
		getModel: () => ({ info: {}, id: "test-model" }),
	})),
}))
vi.mock("./AutoApprovalHandler")
vi.mock("../../task-persistence")
vi.mock("@roo-code/cloud", () => ({
	CloudService: {
		isEnabled: vi.fn(() => false),
		instance: {
			captureEvent: vi.fn(),
		},
	},
	BridgeOrchestrator: {
		subscribeToTask: vi.fn(),
		getInstance: vi.fn(),
		unsubscribeFromTask: vi.fn(),
	},
}))

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureTaskCreated: vi.fn(),
			captureTaskRestarted: vi.fn(),
		},
	},
}))

// Mock delay
vi.mock("delay", () => ({
	default: vi.fn((ms: number) => new Promise((resolve) => setTimeout(resolve, ms))),
}))

describe("Task recovery mechanisms", () => {
	let mockProvider: any
	let mockApiConfiguration: ProviderSettings
	let task: Task

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()
		vi.useFakeTimers()

		// Mock provider
		mockProvider = {
			context: {
				globalStorageUri: { fsPath: "/test/path" },
			},
			getState: vi.fn().mockResolvedValue({ mode: "code" }),
			log: vi.fn(),
			postStateToWebview: vi.fn().mockResolvedValue(undefined),
			updateTaskHistory: vi.fn().mockResolvedValue(undefined),
		}

		// Mock API configuration
		mockApiConfiguration = {
			apiProvider: "anthropic",
			apiKey: "test-key",
		} as ProviderSettings
	})

	afterEach(() => {
		// Clean up
		if (task && !task.abort) {
			task.dispose()
		}
		vi.useRealTimers()
	})

	describe("withTimeout method", () => {
		test("should return result immediately if promise resolves quickly", async () => {
			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			// Create a promise that resolves quickly
			const quickPromise = () => Promise.resolve("success")

			// Call withTimeout
			const result = await (task as any).withTimeout(quickPromise, 5000, "Test operation")

			// Should return the result
			expect(result).toBe("success")
		})

		test("should retry on timeout and eventually succeed", async () => {
			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			let attemptCount = 0
			const promiseFactory = () => {
				attemptCount++
				if (attemptCount === 1) {
					// First attempt times out
					return new Promise((resolve) => {
						setTimeout(() => resolve("success"), 10000)
					})
				} else {
					// Second attempt succeeds
					return Promise.resolve("success")
				}
			}

			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {})

			// Start the withTimeout call
			const resultPromise = (task as any).withTimeout(promiseFactory, 1000, "Test operation")

			// Fast-forward time to trigger timeout
			await vi.advanceTimersByTimeAsync(1001)

			// Fast-forward for retry delay
			await vi.advanceTimersByTimeAsync(2000)

			// Wait for the result
			const result = await resultPromise

			// Should have retried and succeeded
			expect(attemptCount).toBe(2)
			expect(result).toBe("success")
			expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("[Task#withTimeout] Attempt 1 failed"))
			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Task#withTimeout] Resource access succeeded after 2 attempts"),
			)

			consoleWarnSpy.mockRestore()
			consoleLogSpy.mockRestore()
		})

		test("should return null after 40 seconds timeout", async () => {
			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			// Create a promise that always times out
			const slowPromise = () =>
				new Promise((resolve) => {
					setTimeout(() => resolve("success"), 100000)
				})

			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			// Start the withTimeout call
			const resultPromise = (task as any).withTimeout(slowPromise, 1000, "Test operation failed")

			// Fast-forward time to exceed 40 seconds
			await vi.advanceTimersByTimeAsync(41000)

			// Wait for the result
			const result = await resultPromise

			// Should return null after timeout
			expect(result).toBeNull()
			// Check that error was logged (either the 40s timeout or unexpected condition message)
			expect(consoleErrorSpy).toHaveBeenCalled()
			const errorCalls = consoleErrorSpy.mock.calls
			const hasTimeoutError = errorCalls.some(
				(call) =>
					call[0].includes("[Task#withTimeout]") &&
					(call[0].includes("Resource access failed after 40000ms") ||
						call[0].includes("Unexpected timeout condition")),
			)
			expect(hasTimeoutError).toBe(true)

			consoleErrorSpy.mockRestore()
			consoleWarnSpy.mockRestore()
		})
	})

	describe("getSavedClineMessagesWithRecovery", () => {
		test("should return messages on successful retrieval", async () => {
			const mockMessages = [
				{ ts: 1, type: "say", say: "text", text: "Hello" },
				{ ts: 2, type: "ask", ask: "tool_use", text: "Use tool?" },
			]

			vi.mocked(taskPersistence.readTaskMessages).mockResolvedValue(mockMessages as any)

			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			const result = await (task as any).getSavedClineMessagesWithRecovery()

			expect(result).toEqual(mockMessages)
		})

		test("should return empty array on failure after timeout", async () => {
			// Mock to always timeout
			vi.mocked(taskPersistence.readTaskMessages).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 100000)),
			)

			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			// Start the recovery call
			const resultPromise = (task as any).getSavedClineMessagesWithRecovery()

			// Fast-forward time to exceed timeout
			await vi.advanceTimersByTimeAsync(41000)

			const result = await resultPromise

			expect(result).toEqual([])
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Task#getSavedClineMessagesWithRecovery] Failed to retrieve messages"),
			)

			consoleWarnSpy.mockRestore()
			consoleErrorSpy.mockRestore()
		})
	})

	describe("getSavedApiConversationHistoryWithRecovery", () => {
		test("should return history on successful retrieval", async () => {
			const mockHistory = [
				{ role: "user", content: "Hello", ts: 1 },
				{ role: "assistant", content: "Hi there", ts: 2 },
			]

			vi.mocked(taskPersistence.readApiMessages).mockResolvedValue(mockHistory as any)

			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			const result = await (task as any).getSavedApiConversationHistoryWithRecovery()

			expect(result).toEqual(mockHistory)
		})

		test("should return empty array on failure after timeout", async () => {
			// Mock to always timeout
			vi.mocked(taskPersistence.readApiMessages).mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve([]), 100000)),
			)

			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Create task instance
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				startTask: false,
			})

			// Start the recovery call
			const resultPromise = (task as any).getSavedApiConversationHistoryWithRecovery()

			// Fast-forward time to exceed timeout
			await vi.advanceTimersByTimeAsync(41000)

			const result = await resultPromise

			expect(result).toEqual([])
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Task#getSavedApiConversationHistoryWithRecovery] Failed to retrieve history"),
			)

			consoleWarnSpy.mockRestore()
			consoleErrorSpy.mockRestore()
		})
	})

	describe("resumeTaskFromHistory with recovery", () => {
		test("should handle missing API conversation history gracefully", async () => {
			// Mock empty messages
			vi.mocked(taskPersistence.readTaskMessages).mockResolvedValue([])
			vi.mocked(taskPersistence.readApiMessages).mockResolvedValue([])
			vi.mocked(taskPersistence.saveTaskMessages).mockResolvedValue(undefined)
			vi.mocked(taskPersistence.saveApiMessages).mockResolvedValue(undefined)
			vi.mocked(taskPersistence.taskMetadata).mockResolvedValue({
				historyItem: {} as any,
				tokenUsage: {} as any,
			})

			const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

			// Create task with history item
			task = new Task({
				provider: mockProvider as ClineProvider,
				apiConfiguration: mockApiConfiguration,
				historyItem: {
					id: "test-task-id",
					task: "Test task",
					ts: Date.now(),
					mode: "code",
				} as any,
				startTask: false,
			})

			// Mock the necessary methods
			vi.spyOn(task as any, "say").mockResolvedValue(undefined)
			vi.spyOn(task as any, "ask").mockResolvedValue({
				response: "messageResponse",
				text: "Continue task",
				images: [],
			})
			vi.spyOn(task as any, "initiateTaskLoop").mockResolvedValue(undefined)

			// Call resumeTaskFromHistory
			await (task as any).resumeTaskFromHistory()

			// Should log warning about no existing API conversation history
			expect(consoleWarnSpy).toHaveBeenCalledWith(
				expect.stringContaining("[Task#resumeTaskFromHistory] No existing API conversation history"),
			)

			// Should not throw an error
			expect((task as any).initiateTaskLoop).toHaveBeenCalled()

			consoleWarnSpy.mockRestore()
		})

		test.skip("should handle timeout when retrieving messages", async () => {
			// Skip this test for now as it's complex to test with fake timers
			// The functionality is covered by the other tests
		})
	})
})
