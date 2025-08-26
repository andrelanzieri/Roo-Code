import { describe, it, expect, vi, beforeEach } from "vitest"
import { BaseTerminal } from "../BaseTerminal"
import type { ExitCodeDetails, RooTerminalCallbacks, RooTerminalProcessResultPromise } from "../types"

// Create a concrete test implementation of BaseTerminal
class TestTerminal extends BaseTerminal {
	constructor(id: number, cwd: string) {
		super("vscode", id, cwd)
	}

	isClosed(): boolean {
		return false
	}

	runCommand(command: string, callbacks: RooTerminalCallbacks): RooTerminalProcessResultPromise {
		throw new Error("Not implemented for test")
	}
}

describe("Compound Command Simple Tests", () => {
	let terminal: TestTerminal

	beforeEach(() => {
		terminal = new TestTerminal(1, "/test/path")
		vi.clearAllMocks()
		vi.useFakeTimers()
	})

	it("should properly finalize compound command and set busy to false", () => {
		// Set up initial state
		terminal.busy = true
		terminal.running = true

		// Create a mock process - need to implement EventEmitter interface
		const mockProcess = {
			command: "cd dir && ls",
			emit: vi.fn(),
			on: vi.fn(),
			once: vi.fn(),
			hasUnretrievedOutput: vi.fn(() => false),
			getUnretrievedOutput: vi.fn(() => ""),
			isHot: false,
			run: vi.fn(),
			continue: vi.fn(),
			abort: vi.fn(),
			// Add EventEmitter methods
			addListener: vi.fn(),
			removeListener: vi.fn(),
			removeAllListeners: vi.fn(),
			setMaxListeners: vi.fn(),
			getMaxListeners: vi.fn(() => 10),
			listeners: vi.fn(() => []),
			rawListeners: vi.fn(() => []),
			listenerCount: vi.fn(() => 0),
			prependListener: vi.fn(),
			prependOnceListener: vi.fn(),
			eventNames: vi.fn(() => []),
			off: vi.fn(),
		}
		terminal.process = mockProcess as any

		// Detect compound command
		terminal.detectCompoundCommand("cd dir && ls")
		expect(terminal.isCompoundCommand).toBe(true)
		expect(terminal.expectedCompoundProcessCount).toBe(2)

		// Add first completion
		terminal.addCompoundProcessCompletion({ exitCode: 0 }, "cd dir")
		expect(terminal.busy).toBe(true) // Should still be busy
		expect(terminal.isCompoundCommand).toBe(true) // Should still be compound
		expect(terminal.compoundProcessCompletions).toHaveLength(1)

		// Add second completion - this should trigger finalization
		terminal.addCompoundProcessCompletion({ exitCode: 0 }, "ls")

		// After finalization, terminal should not be busy
		expect(terminal.busy).toBe(false)
		expect(terminal.isCompoundCommand).toBe(false)
		expect(terminal.compoundProcessCompletions).toHaveLength(0)

		// Verify that shell_execution_complete was emitted
		expect(mockProcess.emit).toHaveBeenCalledWith("shell_execution_complete", { exitCode: 0 })

		// Process should be cleared
		expect(terminal.process).toBeUndefined()
	})

	it("should handle timeout and finalize", () => {
		terminal.busy = true
		terminal.running = true

		// Create a mock process
		const mockProcess = {
			command: "cd dir && ls",
			emit: vi.fn(),
			on: vi.fn(),
			once: vi.fn(),
			hasUnretrievedOutput: vi.fn(() => false),
			getUnretrievedOutput: vi.fn(() => ""),
		}
		terminal.process = mockProcess as any

		terminal.detectCompoundCommand("cd dir && ls")
		terminal.addCompoundProcessCompletion({ exitCode: 0 }, "cd dir")

		expect(terminal.busy).toBe(true)

		// Fast forward to trigger timeout
		vi.advanceTimersByTime(10001)

		// Should be finalized after timeout
		expect(terminal.busy).toBe(false)
		expect(terminal.isCompoundCommand).toBe(false)
	})
})
