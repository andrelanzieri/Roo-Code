import { TodoItem, ModeConfig } from "@roo-code/types"

import { AttemptCompletionToolUse } from "../../../shared/tools"

// Mock the formatResponse module before importing the tool
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolError: vi.fn((msg: string) => `Error: ${msg}`),
		imageBlocks: vi.fn(() => []),
	},
}))

// Mock the getModeConfig function
vi.mock("../../../shared/modes", () => ({
	getModeConfig: vi.fn(),
}))

// Mock TelemetryService
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureTaskCompleted: vi.fn(),
		},
	},
}))

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn(),
		})),
	},
}))

// Mock Package module
vi.mock("../../../shared/package", () => ({
	Package: {
		name: "roo-cline",
	},
}))

import { attemptCompletionTool } from "../attemptCompletionTool"
import { Task } from "../../task/Task"
import * as vscode from "vscode"
import { getModeConfig } from "../../../shared/modes"

describe("attemptCompletionTool", () => {
	let mockTask: Partial<Task>
	let mockPushToolResult: ReturnType<typeof vi.fn>
	let mockAskApproval: ReturnType<typeof vi.fn>
	let mockHandleError: ReturnType<typeof vi.fn>
	let mockRemoveClosingTag: ReturnType<typeof vi.fn>
	let mockToolDescription: ReturnType<typeof vi.fn>
	let mockAskFinishSubTaskApproval: ReturnType<typeof vi.fn>
	let mockGetConfiguration: ReturnType<typeof vi.fn>
	let mockProvider: any
	let mockGetState: ReturnType<typeof vi.fn>
	let mockHandleModeSwitch: ReturnType<typeof vi.fn>
	let mockPostMessageToWebview: ReturnType<typeof vi.fn>
	let mockSay: ReturnType<typeof vi.fn>
	let mockAsk: ReturnType<typeof vi.fn>
	let mockEmit: ReturnType<typeof vi.fn>
	let mockProviderRef: any

	beforeEach(() => {
		mockPushToolResult = vi.fn()
		mockAskApproval = vi.fn()
		mockHandleError = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, content) => content || "")
		mockToolDescription = vi.fn(() => "attempt_completion")
		mockAskFinishSubTaskApproval = vi.fn()
		mockGetConfiguration = vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: any) => {
				if (key === "preventCompletionWithOpenTodos") {
					return defaultValue // Default to false unless overridden in test
				}
				return defaultValue
			}),
		}))

		// Setup vscode mock
		vi.mocked(vscode.workspace.getConfiguration).mockImplementation(mockGetConfiguration)

		// Mock provider methods
		mockGetState = vi.fn()
		mockHandleModeSwitch = vi.fn()
		mockPostMessageToWebview = vi.fn()

		mockProvider = {
			getState: mockGetState,
			handleModeSwitch: mockHandleModeSwitch,
			postMessageToWebview: mockPostMessageToWebview,
		}

		mockProviderRef = {
			deref: vi.fn(() => mockProvider),
		}

		mockSay = vi.fn()
		mockAsk = vi.fn(() => Promise.resolve({ response: "yesButtonClicked", text: "", images: [] }))
		mockEmit = vi.fn()

		mockTask = {
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			todoList: undefined,
			providerRef: mockProviderRef,
			say: mockSay,
			ask: mockAsk,
			emit: mockEmit,
			clineMessages: [],
			userMessageContent: [],
			taskId: "test-task-id",
			getTokenUsage: vi.fn(() => ({
				totalTokensIn: 100,
				totalTokensOut: 50,
				totalCost: 0.001,
				contextTokens: 80,
				totalCacheWrites: 0,
				totalCacheReads: 0,
			})),
			toolUsage: {},
			parentTask: undefined,
			sayAndCreateMissingParamError: vi.fn(async (tool, param) => `Missing parameter: ${param} for ${tool}`),
		}

		// Reset getModeConfig mock
		vi.mocked(getModeConfig).mockReturnValue({
			slug: "code",
			name: "Code",
			roleDefinition: "Test role",
			groups: ["read", "edit"],
		} as ModeConfig)
	})

	describe("todo list validation", () => {
		it("should allow completion when there is no todo list", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			mockTask.todoList = undefined

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not call pushToolResult with an error for empty todo list
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should allow completion when todo list is empty", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			mockTask.todoList = []

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should allow completion when all todos are completed", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const completedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "completed" },
			]

			mockTask.todoList = completedTodos

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
		})

		it("should prevent completion when there are pending todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when there are in-progress todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithInProgress: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "in_progress" },
			]

			mockTask.todoList = todosWithInProgress

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when there are mixed incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const mixedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
				{ id: "3", content: "Third task", status: "in_progress" },
			]

			mockTask.todoList = mixedTodos

			// Enable the setting to prevent completion with open todos
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should allow completion when setting is disabled even with incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Ensure the setting is disabled (default behavior)
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return false // Setting is disabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should not prevent completion when setting is disabled
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should prevent completion when setting is enabled with incomplete todos", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const todosWithPending: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "pending" },
			]

			mockTask.todoList = todosWithPending

			// Enable the setting
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should prevent completion when setting is enabled and there are incomplete todos
			expect(mockTask.consecutiveMistakeCount).toBe(1)
			expect(mockTask.recordToolError).toHaveBeenCalledWith("attempt_completion")
			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})

		it("should allow completion when setting is enabled but all todos are completed", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			const completedTodos: TodoItem[] = [
				{ id: "1", content: "First task", status: "completed" },
				{ id: "2", content: "Second task", status: "completed" },
			]

			mockTask.todoList = completedTodos

			// Enable the setting
			mockGetConfiguration.mockReturnValue({
				get: vi.fn((key: string, defaultValue: any) => {
					if (key === "preventCompletionWithOpenTodos") {
						return true // Setting is enabled
					}
					return defaultValue
				}),
			})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Should allow completion when setting is enabled but all todos are completed
			expect(mockTask.consecutiveMistakeCount).toBe(0)
			expect(mockTask.recordToolError).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalledWith(
				expect.stringContaining("Cannot complete task while there are incomplete todos"),
			)
		})
	})

	describe("onComplete actions", () => {
		beforeEach(() => {
			// Setup default state for onComplete tests
			mockGetState.mockResolvedValue({
				mode: "code",
				customModes: [],
			})
		})

		it("should execute mode switch when onComplete.switchToMode is configured", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Configure mode with onComplete.switchToMode
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "architect",
				name: "Architect",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					switchToMode: "code",
				},
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify mode switch was called
			expect(mockHandleModeSwitch).toHaveBeenCalledWith("code")
			expect(mockSay).toHaveBeenCalledWith("text", "Automatically switching to code mode as configured...")
		})

		it("should execute command when onComplete.runCommand is configured", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Configure mode with onComplete.runCommand
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "code",
				name: "Code",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					runCommand: "/test-command",
				},
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify command was executed
			expect(mockPostMessageToWebview).toHaveBeenCalledWith({
				type: "invoke",
				invoke: "sendMessage",
				text: "/test-command",
			})
			expect(mockSay).toHaveBeenCalledWith("text", "Automatically executing command: /test-command")
		})

		it("should include summary when onComplete.includeSummary is true", async () => {
			const taskResult = "Task completed with specific results"
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: taskResult },
				partial: false,
			}

			// Configure mode with onComplete.runCommand and includeSummary
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "code",
				name: "Code",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					runCommand: "/review",
					includeSummary: true,
				},
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify command was executed with summary
			expect(mockPostMessageToWebview).toHaveBeenCalledWith({
				type: "invoke",
				invoke: "sendMessage",
				text: `/review\n\nContext from previous task:\n${taskResult}`,
			})
		})

		it("should execute both mode switch and command when both are configured", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Configure mode with both onComplete actions
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "architect",
				name: "Architect",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					switchToMode: "debug",
					runCommand: "/analyze",
					includeSummary: false,
				},
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify both actions were executed
			expect(mockHandleModeSwitch).toHaveBeenCalledWith("debug")
			expect(mockPostMessageToWebview).toHaveBeenCalledWith({
				type: "invoke",
				invoke: "sendMessage",
				text: "/analyze",
			})
		})

		it("should handle errors in onComplete actions gracefully", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Configure mode with onComplete.switchToMode that will fail
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "code",
				name: "Code",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					switchToMode: "invalid-mode",
				},
			} as ModeConfig)

			// Make handleModeSwitch throw an error
			mockHandleModeSwitch.mockRejectedValue(new Error("Invalid mode"))

			// Add console.error spy
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify error was logged but didn't break completion
			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to execute onComplete actions:", expect.any(Error))

			// Verify completion still succeeded (ask was called for completion_result)
			expect(mockAsk).toHaveBeenCalledWith("completion_result", "", false)

			consoleErrorSpy.mockRestore()
		})

		it("should not execute onComplete actions when mode has no onComplete config", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Mode without onComplete configuration
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "code",
				name: "Code",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				// No onComplete field
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify no onComplete actions were executed
			expect(mockHandleModeSwitch).not.toHaveBeenCalled()
			expect(mockPostMessageToWebview).not.toHaveBeenCalled()
		})

		it("should not execute onComplete actions when provider is not available", async () => {
			const block: AttemptCompletionToolUse = {
				type: "tool_use",
				name: "attempt_completion",
				params: { result: "Task completed successfully" },
				partial: false,
			}

			// Make provider unavailable
			mockProviderRef.deref.mockReturnValue(null)

			// Configure mode with onComplete actions
			vi.mocked(getModeConfig).mockReturnValue({
				slug: "code",
				name: "Code",
				roleDefinition: "Test role",
				groups: ["read", "edit"],
				onComplete: {
					switchToMode: "architect",
					runCommand: "/test",
				},
			} as ModeConfig)

			await attemptCompletionTool(
				mockTask as Task,
				block,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
				mockToolDescription,
				mockAskFinishSubTaskApproval,
			)

			// Verify no onComplete actions were executed
			expect(mockHandleModeSwitch).not.toHaveBeenCalled()
			expect(mockPostMessageToWebview).not.toHaveBeenCalled()
		})
	})
})
