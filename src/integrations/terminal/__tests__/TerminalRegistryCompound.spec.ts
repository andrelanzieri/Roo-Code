import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { TerminalRegistry } from "../TerminalRegistry"
import { Terminal } from "../Terminal"
import type { ExitCodeDetails } from "../types"

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		onDidCloseTerminal: vi.fn(() => ({ dispose: vi.fn() })),
		onDidStartTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
		onDidEndTerminalShellExecution: vi.fn(() => ({ dispose: vi.fn() })),
		createTerminal: vi.fn(() => ({
			shellIntegration: undefined,
			exitStatus: undefined,
		})),
		terminals: [],
	},
	ThemeIcon: vi.fn(),
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path })),
	},
}))

describe("TerminalRegistry Compound Command Handling", () => {
	let startHandler: ((e: any) => void) | undefined
	let endHandler: ((e: any) => void) | undefined

	beforeEach(() => {
		vi.clearAllMocks()

		// Reset the TerminalRegistry's initialization state
		// @ts-ignore - accessing private property for testing
		TerminalRegistry["isInitialized"] = false
		// @ts-ignore - accessing private property for testing
		TerminalRegistry["terminals"] = []
		// @ts-ignore - accessing private property for testing
		TerminalRegistry["nextTerminalId"] = 1
		// @ts-ignore - accessing private property for testing
		TerminalRegistry["disposables"] = []

		// Capture the event handlers
		vi.mocked(vscode.window.onDidStartTerminalShellExecution).mockImplementation((handler: any) => {
			startHandler = handler
			return { dispose: vi.fn() }
		})

		vi.mocked(vscode.window.onDidEndTerminalShellExecution).mockImplementation((handler: any) => {
			endHandler = handler
			return { dispose: vi.fn() }
		})

		// Initialize the registry
		TerminalRegistry.initialize()
	})

	afterEach(() => {
		TerminalRegistry.cleanup()
		vi.clearAllTimers()
	})

	describe("Compound command execution flow", () => {
		it("should wait for all processes in a compound command before marking terminal as not busy", async () => {
			// Mock the VSCode terminal first
			const mockVSCETerminal = {
				shellIntegration: { cwd: { fsPath: "/test/path" } },
				exitStatus: undefined,
			}

			// Create a terminal through the registry
			const terminal = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal

			// Replace the terminal's vscode terminal with our mock
			terminal.terminal = mockVSCETerminal as any

			// Add the terminal to the registry's internal list so it can be found
			// @ts-ignore - accessing private property for testing
			const terminals = TerminalRegistry["terminals"]
			// Ensure our terminal is in the list
			if (!terminals.includes(terminal)) {
				terminals.push(terminal)
			}

			// Set up a compound command
			const command = "cd dir && command_with_output"
			terminal.detectCompoundCommand(command)
			terminal.busy = true
			terminal.running = true

			// Create a mock process
			const mockProcess = {
				command,
				emit: vi.fn(),
				on: vi.fn(),
				once: vi.fn(),
				hasUnretrievedOutput: vi.fn(() => false),
				getUnretrievedOutput: vi.fn(() => ""),
			}
			terminal.process = mockProcess as any

			// Simulate the first process (cd dir) completing
			const firstEndEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "cd dir" },
				},
			}

			// Call the end handler for the first process
			if (endHandler) {
				await endHandler(firstEndEvent)
			}

			// Terminal should still be busy because it's waiting for the second process
			expect(terminal.busy).toBe(true)
			expect(terminal.compoundProcessCompletions).toHaveLength(1)
			expect(terminal.compoundProcessCompletions[0].command).toBe("cd dir")

			// Simulate the second process (command_with_output) completing
			const secondEndEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "command_with_output" },
				},
			}

			// Call the end handler for the second process
			if (endHandler) {
				await endHandler(secondEndEvent)
			}

			// Now the terminal should not be busy
			expect(terminal.busy).toBe(false)
			expect(terminal.isCompoundCommand).toBe(false)
			expect(terminal.compoundProcessCompletions).toHaveLength(0)
		})

		it("should handle compound commands with multiple operators", async () => {
			// Mock the VSCode terminal first
			const mockVSCETerminal = {
				shellIntegration: { cwd: { fsPath: "/test/path" } },
				exitStatus: undefined,
			}

			// Create a terminal through the registry
			const terminal = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal

			// Replace the terminal's vscode terminal with our mock
			terminal.terminal = mockVSCETerminal as any

			// Set up a complex compound command
			const command = "cd /tmp && npm install && npm test || echo 'Failed'"
			terminal.detectCompoundCommand(command)
			terminal.busy = true
			terminal.running = true

			// Create a mock process
			const mockProcess = {
				command,
				emit: vi.fn(),
				on: vi.fn(),
				once: vi.fn(),
				hasUnretrievedOutput: vi.fn(() => false),
				getUnretrievedOutput: vi.fn(() => ""),
			}
			terminal.process = mockProcess as any

			// Simulate processes completing
			const processes = [
				{ command: "cd /tmp", exitCode: 0 },
				{ command: "npm install", exitCode: 0 },
				{ command: "npm test", exitCode: 1 },
				{ command: "echo 'Failed'", exitCode: 0 },
			]

			for (let i = 0; i < processes.length; i++) {
				const endEvent = {
					terminal: mockVSCETerminal,
					exitCode: processes[i].exitCode,
					execution: {
						commandLine: { value: processes[i].command },
					},
				}

				if (endHandler) {
					await endHandler(endEvent)
				}

				// Check intermediate state
				if (i < processes.length - 1) {
					expect(terminal.busy).toBe(true)
					expect(terminal.compoundProcessCompletions).toHaveLength(i + 1)
				}
			}

			// After all processes complete
			expect(terminal.busy).toBe(false)
			expect(terminal.isCompoundCommand).toBe(false)
			expect(terminal.compoundProcessCompletions).toHaveLength(0)
		})

		it("should handle timeout for incomplete compound commands", async () => {
			vi.useFakeTimers()

			// Mock the VSCode terminal first
			const mockVSCETerminal = {
				shellIntegration: { cwd: { fsPath: "/test/path" } },
				exitStatus: undefined,
			}

			// Create a terminal through the registry
			const terminal = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal

			// Replace the terminal's vscode terminal with our mock
			terminal.terminal = mockVSCETerminal as any

			// Set up a compound command
			const command = "cd dir && command_with_output"
			terminal.detectCompoundCommand(command)
			terminal.busy = true
			terminal.running = true

			// Create a mock process
			const mockProcess = {
				command,
				emit: vi.fn(),
				on: vi.fn(),
				once: vi.fn(),
				hasUnretrievedOutput: vi.fn(() => false),
				getUnretrievedOutput: vi.fn(() => ""),
			}
			terminal.process = mockProcess as any

			// Simulate only the first process completing
			const firstEndEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "cd dir" },
				},
			}

			if (endHandler) {
				await endHandler(firstEndEvent)
			}

			// Terminal should still be busy
			expect(terminal.busy).toBe(true)

			// Fast-forward time to trigger the timeout
			vi.advanceTimersByTime(10001)

			// After timeout, terminal should be marked as not busy
			expect(terminal.busy).toBe(false)
			expect(terminal.isCompoundCommand).toBe(false)

			vi.useRealTimers()
		})

		it("should handle compound commands that complete before being marked as running", async () => {
			// Mock the VSCode terminal first
			const mockVSCETerminal = {
				shellIntegration: { cwd: { fsPath: "/test/path" } },
				exitStatus: undefined,
			}

			// Create a terminal through the registry
			const terminal = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal

			// Replace the terminal's vscode terminal with our mock
			terminal.terminal = mockVSCETerminal as any

			// Set up a compound command
			const command = "cd dir && ls"
			terminal.detectCompoundCommand(command)
			terminal.busy = true
			terminal.running = false // Not yet marked as running

			// Create a mock process
			const mockProcess = {
				command,
				emit: vi.fn(),
				on: vi.fn(),
				once: vi.fn(),
				hasUnretrievedOutput: vi.fn(() => false),
				getUnretrievedOutput: vi.fn(() => ""),
			}
			terminal.process = mockProcess as any

			// Simulate both processes completing quickly
			const firstEndEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "cd dir" },
				},
			}

			const secondEndEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "ls" },
				},
			}

			// Both events fire before terminal is marked as running
			if (endHandler) {
				await endHandler(firstEndEvent)
				await endHandler(secondEndEvent)
			}

			// Terminal should handle this gracefully
			expect(terminal.compoundProcessCompletions).toHaveLength(2)
		})
	})

	describe("Error handling", () => {
		it("should handle shell execution end events from non-Roo terminals", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Create a mock terminal that's not registered with Roo
			const unknownTerminal = {
				shellIntegration: undefined,
				exitStatus: undefined,
			}

			const endEvent = {
				terminal: unknownTerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "some command" },
				},
			}

			// This should not throw an error
			if (endHandler) {
				await endHandler(endEvent)
			}

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("Shell execution ended, but not from a Roo-registered terminal"),
				expect.anything(),
			)

			consoleErrorSpy.mockRestore()
		})

		it("should handle shell execution end events when process is undefined", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			// Mock the VSCode terminal first
			const mockVSCETerminal = {
				shellIntegration: { cwd: { fsPath: "/test/path" } },
				exitStatus: undefined,
			}

			// Create a terminal through the registry
			const terminal = TerminalRegistry.createTerminal("/test/path", "vscode") as Terminal

			// Replace the terminal's vscode terminal with our mock
			terminal.terminal = mockVSCETerminal as any
			terminal.running = true
			terminal.process = undefined // No process

			const endEvent = {
				terminal: mockVSCETerminal,
				exitCode: 0,
				execution: {
					commandLine: { value: "some command" },
				},
			}

			if (endHandler) {
				await endHandler(endEvent)
			}

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					"Shell execution end event received on running terminal, but process is undefined",
				),
				expect.anything(),
			)

			consoleErrorSpy.mockRestore()
		})
	})
})
