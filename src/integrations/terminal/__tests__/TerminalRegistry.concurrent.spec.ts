import { describe, it, expect, beforeEach, afterEach, vi, Mock } from "vitest"
import { TerminalRegistry } from "../TerminalRegistry"
import { Terminal } from "../Terminal"
import { ExecaTerminal } from "../ExecaTerminal"
import { TerminalProcess } from "../TerminalProcess"

// Mocks need to be defined in factory functions to avoid hoisting issues
vi.mock("vscode", () => {
	const mockOnDidCloseTerminal = vi.fn()
	const mockOnDidStartTerminalShellExecution = vi.fn()
	const mockOnDidEndTerminalShellExecution = vi.fn()

	return {
		window: {
			onDidCloseTerminal: mockOnDidCloseTerminal,
			onDidStartTerminalShellExecution: mockOnDidStartTerminalShellExecution,
			onDidEndTerminalShellExecution: mockOnDidEndTerminalShellExecution,
		},
		Uri: {
			file: vi.fn((path: string) => ({ fsPath: path })),
		},
	}
})

vi.mock("../Terminal")
vi.mock("../ExecaTerminal")
vi.mock("../ShellIntegrationManager", () => ({
	ShellIntegrationManager: {
		zshCleanupTmpDir: vi.fn(),
		clear: vi.fn(),
		terminalTmpDirs: new Map(),
	},
}))
vi.mock("../TerminalProcess", () => ({
	TerminalProcess: {
		interpretExitCode: vi.fn((code: any) => ({ exitCode: code })),
	},
}))

// Import vscode after mocks are set up
import * as vscode from "vscode"

describe("TerminalRegistry - Concurrent Operations", () => {
	let mockDisposable: vscode.Disposable
	let mockVsCodeWindow: any

	beforeEach(() => {
		// Reset the terminals array for each test
		;(TerminalRegistry as any).terminals = []
		;(TerminalRegistry as any).nextTerminalId = 1
		;(TerminalRegistry as any).isInitialized = false
		;(TerminalRegistry as any).disposables = []

		mockDisposable = { dispose: vi.fn() }

		// Get mocked window object
		mockVsCodeWindow = vi.mocked(vscode.window)

		// Mock vscode event handlers to return disposable
		mockVsCodeWindow.onDidCloseTerminal.mockReturnValue(mockDisposable)
		mockVsCodeWindow.onDidStartTerminalShellExecution.mockReturnValue(mockDisposable)
		mockVsCodeWindow.onDidEndTerminalShellExecution.mockReturnValue(mockDisposable)
	})

	afterEach(() => {
		vi.clearAllMocks()
		try {
			TerminalRegistry.cleanup()
		} catch (e) {
			// Ignore cleanup errors in tests
		}
	})

	describe("Non-blocking Shell Execution Handlers", () => {
		it("should handle shell execution start events asynchronously", async () => {
			TerminalRegistry.initialize()

			const mockTerminal = {
				id: 1,
				provider: "vscode",
				setActiveStream: vi.fn(),
				busy: false,
			}

			const mockVSCodeTerminal = {} as vscode.Terminal
			const mockExecution = {
				read: vi.fn().mockReturnValue("mock-stream"),
				commandLine: { value: "test-command" },
			}

			const mockEvent = {
				terminal: mockVSCodeTerminal,
				execution: mockExecution,
			} as any

			// Add the terminal to registry
			;(TerminalRegistry as any).terminals = [mockTerminal]

			// Mock getTerminalByVSCETerminal to return our mock terminal
			const getTerminalSpy = vi
				.spyOn(TerminalRegistry as any, "getTerminalByVSCETerminal")
				.mockReturnValue(mockTerminal)

			// Get the handler that was registered
			const startHandler = mockVsCodeWindow.onDidStartTerminalShellExecution.mock.calls[0][0]

			// Call the handler with our mock event
			startHandler(mockEvent)

			// Use setImmediate to wait for async processing
			await new Promise((resolve) => setImmediate(resolve))

			// Verify the terminal was processed
			expect(mockTerminal.setActiveStream).toHaveBeenCalledWith("mock-stream")
			expect(mockTerminal.busy).toBe(true)
		})

		it("should handle shell execution end events asynchronously", async () => {
			TerminalRegistry.initialize()

			const mockProcess = {
				hasUnretrievedOutput: vi.fn().mockReturnValue(false),
				emit: vi.fn(),
			}

			const mockTerminal = {
				id: 1,
				provider: "vscode",
				busy: true,
				running: true,
				process: mockProcess,
				shellExecutionComplete: vi.fn(),
				completedProcesses: [],
			}

			const mockVSCodeTerminal = {} as vscode.Terminal
			const mockExecution = {
				commandLine: { value: "test-command" },
			}

			const mockEvent = {
				terminal: mockVSCodeTerminal,
				execution: mockExecution,
				exitCode: 0,
			} as any

			// Add the terminal to registry
			;(TerminalRegistry as any).terminals = [mockTerminal]

			// Mock getTerminalByVSCETerminal to return our mock terminal
			vi.spyOn(TerminalRegistry as any, "getTerminalByVSCETerminal").mockReturnValue(mockTerminal)

			// Get the handler that was registered
			const endHandler = mockVsCodeWindow.onDidEndTerminalShellExecution.mock.calls[0][0]

			// Call the handler with our mock event
			endHandler(mockEvent)

			// Use setImmediate to wait for async processing
			await new Promise((resolve) => setImmediate(resolve))

			// Verify the terminal was processed
			expect(mockTerminal.shellExecutionComplete).toHaveBeenCalled()
			expect(mockTerminal.busy).toBe(false)
		})

		it("should not block when processing multiple concurrent events", async () => {
			TerminalRegistry.initialize()

			const terminals = Array.from({ length: 5 }, (_, i) => ({
				id: i + 1,
				provider: "vscode" as const,
				busy: false,
				running: false,
				setActiveStream: vi.fn(),
				shellExecutionComplete: vi.fn(),
				process: undefined,
			}))

			// Add all terminals to registry
			;(TerminalRegistry as any).terminals = terminals

			const startHandler = mockVsCodeWindow.onDidStartTerminalShellExecution.mock.calls[0][0]

			// Create multiple concurrent events
			const events = terminals.map((terminal, i) => ({
				terminal: {} as vscode.Terminal,
				execution: {
					read: vi.fn().mockReturnValue(`stream-${i}`),
					commandLine: { value: `command-${i}` },
				},
			}))

			// Mock getTerminalByVSCETerminal to return corresponding terminal
			const getTerminalSpy = vi.spyOn(TerminalRegistry as any, "getTerminalByVSCETerminal")
			getTerminalSpy.mockImplementation((vsceTerminal) => {
				const index = events.findIndex((e) => e.terminal === vsceTerminal)
				return index >= 0 ? terminals[index] : undefined
			})

			// Fire all events simultaneously
			const startTime = Date.now()
			events.forEach((event) => startHandler(event as any))
			const syncTime = Date.now() - startTime

			// Handlers should return immediately (non-blocking)
			expect(syncTime).toBeLessThan(10)

			// Wait for all async processing to complete
			await new Promise((resolve) => setImmediate(resolve))

			// Verify all terminals were processed
			terminals.forEach((terminal, i) => {
				expect(terminal.setActiveStream).toHaveBeenCalledWith(`stream-${i}`)
				expect(terminal.busy).toBe(true)
			})
		})
	})

	describe("Task Isolation", () => {
		it("should not reuse terminals across different tasks", async () => {
			const cwd = "/test/project"

			// Mock Terminal constructor
			const mockTerminals: any[] = []
			;(Terminal as any).mockImplementation(function (this: any, id: number, _terminal: any, cwd: string) {
				const terminal = {
					id,
					provider: "vscode",
					initialCwd: cwd,
					busy: false,
					taskId: undefined,
					getCurrentWorkingDirectory: vi.fn().mockReturnValue(cwd),
					isClosed: vi.fn().mockReturnValue(false),
				}
				mockTerminals.push(terminal)
				return terminal
			})

			// Create terminal for task1
			const terminal1 = await TerminalRegistry.getOrCreateTerminal(cwd, "task1")
			expect(terminal1.taskId).toBe("task1")

			// Mark terminal1 as not busy to make it available
			terminal1.busy = false

			// Request terminal for task2 should create a new one, not reuse task1's terminal
			const terminal2 = await TerminalRegistry.getOrCreateTerminal(cwd, "task2")

			expect(terminal2).not.toBe(terminal1)
			expect(terminal2.taskId).toBe("task2")
			expect(terminal1.taskId).toBe("task1") // task1's terminal should remain unchanged
		})

		it("should allow terminal reuse within the same task", async () => {
			const cwd = "/test/project"

			// Mock Terminal constructor
			const mockTerminal = {
				id: 1,
				provider: "vscode",
				initialCwd: cwd,
				busy: false,
				taskId: undefined,
				getCurrentWorkingDirectory: vi.fn().mockReturnValue(cwd),
				isClosed: vi.fn().mockReturnValue(false),
			}

			;(Terminal as any).mockImplementation(() => mockTerminal)

			// Create terminal for task1
			const terminal1 = await TerminalRegistry.getOrCreateTerminal(cwd, "task1")
			terminal1.busy = false

			// Request another terminal for task1 should reuse the existing one
			const terminal2 = await TerminalRegistry.getOrCreateTerminal(cwd, "task1")

			expect(terminal2).toBe(terminal1)
			expect(terminal2.taskId).toBe("task1")
		})

		it("should properly release terminals when task completes", () => {
			const terminals = [
				{ id: 1, taskId: "task1", busy: true, process: {} },
				{ id: 2, taskId: "task2", busy: true, process: {} },
				{ id: 3, taskId: "task1", busy: false, process: {} },
			]

			;(TerminalRegistry as any).terminals = terminals

			TerminalRegistry.releaseTerminalsForTask("task1")

			// Verify task1 terminals were released
			expect(terminals[0].taskId).toBeUndefined()
			expect(terminals[0].busy).toBe(false)
			expect(terminals[0].process).toBeUndefined()

			expect(terminals[2].taskId).toBeUndefined()
			expect(terminals[2].busy).toBe(false)
			expect(terminals[2].process).toBeUndefined()

			// task2 terminal should be unaffected
			expect(terminals[1].taskId).toBe("task2")
			expect(terminals[1].busy).toBe(true)
			expect(terminals[1].process).toBeDefined()
		})

		it("should only use unassigned terminals for new tasks", async () => {
			const cwd = "/test/project"

			// Create an unassigned terminal
			const unassignedTerminal: any = {
				id: 1,
				provider: "vscode" as const,
				busy: false,
				taskId: undefined,
				getCurrentWorkingDirectory: vi.fn().mockReturnValue(cwd),
				isClosed: vi.fn().mockReturnValue(false),
			}

			// Create a terminal assigned to another task
			const assignedTerminal: any = {
				id: 2,
				provider: "vscode" as const,
				busy: false,
				taskId: "other-task",
				getCurrentWorkingDirectory: vi.fn().mockReturnValue(cwd),
				isClosed: vi.fn().mockReturnValue(false),
			}

			;(TerminalRegistry as any).terminals = [assignedTerminal, unassignedTerminal]

			// Request terminal for a new task
			const terminal = await TerminalRegistry.getOrCreateTerminal(cwd, "new-task")

			// Should use the unassigned terminal, not the one assigned to other-task
			expect(terminal).toBe(unassignedTerminal)
			expect(unassignedTerminal.taskId).toBe("new-task")
			expect(assignedTerminal.taskId).toBe("other-task") // Should remain unchanged
		})
	})

	describe("Error Handling", () => {
		it("should handle errors in shell execution start handler", async () => {
			TerminalRegistry.initialize()

			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			const mockEvent = {
				terminal: {} as vscode.Terminal,
				execution: {
					read: vi.fn().mockImplementation(() => {
						throw new Error("Stream read failed")
					}),
					commandLine: { value: "test-command" },
				},
			} as any

			const startHandler = mockVsCodeWindow.onDidStartTerminalShellExecution.mock.calls[0][0]

			// Should not throw
			expect(() => startHandler(mockEvent)).not.toThrow()

			// Wait for async processing
			await new Promise((resolve) => setImmediate(resolve))

			// Should log the error
			expect(consoleSpy).toHaveBeenCalledWith(
				"[onDidStartTerminalShellExecution] Error handling shell execution start:",
				expect.any(Error),
			)

			consoleSpy.mockRestore()
		})

		it("should handle errors in shell execution end handler", async () => {
			TerminalRegistry.initialize()

			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Mock getTerminalByVSCETerminal to throw
			vi.spyOn(TerminalRegistry as any, "getTerminalByVSCETerminal").mockImplementation(() => {
				throw new Error("Terminal lookup failed")
			})

			const mockEvent = {
				terminal: {} as vscode.Terminal,
				execution: { commandLine: { value: "test-command" } },
				exitCode: 0,
			} as any

			const endHandler = mockVsCodeWindow.onDidEndTerminalShellExecution.mock.calls[0][0]

			// Should not throw
			expect(() => endHandler(mockEvent)).not.toThrow()

			// Wait for async processing
			await new Promise((resolve) => setImmediate(resolve))

			// Should log the error
			expect(consoleSpy).toHaveBeenCalledWith(
				"[onDidEndTerminalShellExecution] Error handling shell execution end:",
				expect.any(Error),
			)

			consoleSpy.mockRestore()
		})
	})
})
