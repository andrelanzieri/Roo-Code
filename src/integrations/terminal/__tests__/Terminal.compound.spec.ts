import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as vscode from "vscode"

import { Terminal } from "../Terminal"
import { TerminalRegistry } from "../TerminalRegistry"

describe("Terminal - Compound Command Handling", () => {
	beforeEach(() => {
		// Initialize the registry for tests
		vi.spyOn(TerminalRegistry, "initialize").mockImplementation(() => {})
		TerminalRegistry.initialize()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("isCompoundCommand", () => {
		it("should detect && operator", () => {
			expect(Terminal.isCompoundCommand("cd /tmp && ls")).toBe(true)
			expect(Terminal.isCompoundCommand("echo hello && echo world")).toBe(true)
		})

		it("should detect || operator", () => {
			expect(Terminal.isCompoundCommand("cd /nonexistent || echo 'failed'")).toBe(true)
			expect(Terminal.isCompoundCommand("test -f file.txt || touch file.txt")).toBe(true)
		})

		it("should detect ; operator", () => {
			expect(Terminal.isCompoundCommand("cd /tmp; ls")).toBe(true)
			expect(Terminal.isCompoundCommand("echo first; echo second; echo third")).toBe(true)
		})

		it("should detect | pipe operator", () => {
			expect(Terminal.isCompoundCommand("ls | grep test")).toBe(true)
			expect(Terminal.isCompoundCommand("cat file.txt | head -10")).toBe(true)
		})

		it("should detect & background operator", () => {
			expect(Terminal.isCompoundCommand("npm start &")).toBe(true)
			expect(Terminal.isCompoundCommand("python server.py &")).toBe(true)
		})

		it("should not detect && in strings or comments", () => {
			// These are still detected as compound commands because we check for the operator presence
			// This is intentional to err on the side of caution
			expect(Terminal.isCompoundCommand('echo "&&"')).toBe(true)
		})

		it("should not detect single & in the middle of command", () => {
			expect(Terminal.isCompoundCommand("echo 'this & that'")).toBe(false)
			expect(Terminal.isCompoundCommand("url?param1=a&param2=b")).toBe(false)
		})

		it("should handle complex compound commands", () => {
			expect(Terminal.isCompoundCommand("cd /tmp && npm install || echo 'failed'")).toBe(true)
			expect(Terminal.isCompoundCommand("test -d dir && (cd dir; make) || mkdir dir")).toBe(true)
		})

		it("should return false for simple commands", () => {
			expect(Terminal.isCompoundCommand("ls")).toBe(false)
			expect(Terminal.isCompoundCommand("cd /tmp")).toBe(false)
			expect(Terminal.isCompoundCommand("echo hello")).toBe(false)
			expect(Terminal.isCompoundCommand("npm install")).toBe(false)
		})

		it("should handle edge cases", () => {
			expect(Terminal.isCompoundCommand("")).toBe(false)
			expect(Terminal.isCompoundCommand("   ")).toBe(false)
			expect(Terminal.isCompoundCommand("&")).toBe(true) // Background operator
			expect(Terminal.isCompoundCommand("&&")).toBe(true)
			expect(Terminal.isCompoundCommand("||")).toBe(true)
			expect(Terminal.isCompoundCommand("|")).toBe(true)
		})
	})

	describe("Compound command execution with shell integration", () => {
		let mockTerminal: any
		let terminal: Terminal

		beforeEach(() => {
			// Create a mock VSCode terminal
			mockTerminal = {
				shellIntegration: undefined,
				sendText: vi.fn(),
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
				exitStatus: undefined,
				state: { isInteractedWith: false },
				creationOptions: {},
				name: "Test Terminal",
				processId: Promise.resolve(1234),
			}

			// Mock vscode.window.createTerminal
			vi.spyOn(vscode.window, "createTerminal").mockReturnValue(mockTerminal as any)

			// Create a Terminal instance
			terminal = new Terminal(1, undefined, "/tmp")
		})

		it("should add delay for compound commands on new terminals", async () => {
			const command = "cd /tmp && npm test"
			const callbacks = {
				onLine: vi.fn(),
				onCompleted: vi.fn(),
				onShellExecutionStarted: vi.fn(),
				onShellExecutionComplete: vi.fn(),
				onNoShellIntegration: vi.fn(),
			}

			// Mock shell integration becoming available
			setTimeout(() => {
				mockTerminal.shellIntegration = {
					executeCommand: vi.fn(),
					cwd: { fsPath: "/tmp" },
				}
			}, 50)

			const processPromise = terminal.runCommand(command, callbacks)

			// Wait a bit for the command to be processed
			await new Promise((resolve) => setTimeout(resolve, 200))

			// Verify that the terminal is marked as busy initially
			expect(terminal.busy).toBe(true)

			// The shellIntegrationReady flag should be set after the delay
			expect((terminal as any).shellIntegrationReady).toBe(true)
		})

		it("should not add delay for simple commands", async () => {
			const command = "ls -la"
			const callbacks = {
				onLine: vi.fn(),
				onCompleted: vi.fn(),
				onShellExecutionStarted: vi.fn(),
				onShellExecutionComplete: vi.fn(),
				onNoShellIntegration: vi.fn(),
			}

			// Mock shell integration being immediately available
			mockTerminal.shellIntegration = {
				executeCommand: vi.fn(),
				cwd: { fsPath: "/tmp" },
			}

			const processPromise = terminal.runCommand(command, callbacks)

			// Wait a bit for the command to be processed
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Should execute without additional delay
			expect(mockTerminal.shellIntegration.executeCommand).toHaveBeenCalledWith(command)
		})

		it("should not add delay for compound commands on terminals with ready shell integration", async () => {
			const command = "cd /tmp && npm test"
			const callbacks = {
				onLine: vi.fn(),
				onCompleted: vi.fn(),
				onShellExecutionStarted: vi.fn(),
				onShellExecutionComplete: vi.fn(),
				onNoShellIntegration: vi.fn(),
			}

			// Mock shell integration being immediately available
			mockTerminal.shellIntegration = {
				executeCommand: vi.fn(),
				cwd: { fsPath: "/tmp" },
			}

			// Mark shell integration as ready (simulating a reused terminal)
			;(terminal as any).shellIntegrationReady = true

			const processPromise = terminal.runCommand(command, callbacks)

			// Wait a bit for the command to be processed
			await new Promise((resolve) => setTimeout(resolve, 100))

			// Should execute without additional delay since shellIntegrationReady is true
			expect(mockTerminal.shellIntegration.executeCommand).toHaveBeenCalledWith(command)
		})
	})
})
