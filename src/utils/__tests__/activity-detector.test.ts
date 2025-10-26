import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { ActivityDetector, getActivityDetector } from "../activity-detector"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		onDidChangeTextDocument: vi.fn((callback) => ({
			dispose: vi.fn(),
		})),
	},
	window: {
		onDidChangeTextEditorSelection: vi.fn((callback) => ({
			dispose: vi.fn(),
		})),
		onDidChangeActiveTextEditor: vi.fn((callback) => ({
			dispose: vi.fn(),
		})),
		showWarningMessage: vi.fn(),
	},
	TextDocumentChangeReason: {
		Undo: 1,
		Redo: 2,
	},
	TextEditorSelectionChangeKind: {
		Keyboard: 1,
		Mouse: 2,
		Command: 3,
	},
}))

describe("ActivityDetector", () => {
	let detector: ActivityDetector
	let mockDisposable: { dispose: ReturnType<typeof vi.fn> }

	beforeEach(() => {
		vi.clearAllMocks()
		vi.useFakeTimers()

		// Setup mock disposable
		mockDisposable = { dispose: vi.fn() }

		// Setup event handler mocks to return disposables
		vi.mocked(vscode.workspace.onDidChangeTextDocument).mockReturnValue(mockDisposable)
		vi.mocked(vscode.window.onDidChangeTextEditorSelection).mockReturnValue(mockDisposable)
		vi.mocked(vscode.window.onDidChangeActiveTextEditor).mockReturnValue(mockDisposable)

		// Reset singleton instance
		if (ActivityDetector["instance"]) {
			ActivityDetector["instance"]?.dispose()
		}

		detector = ActivityDetector.getInstance()
	})

	afterEach(() => {
		detector.dispose()
		vi.useRealTimers()
	})

	describe("getInstance", () => {
		it("should return the same instance when called multiple times", () => {
			const instance1 = ActivityDetector.getInstance()
			const instance2 = ActivityDetector.getInstance()
			expect(instance1).toBe(instance2)
		})

		it("should create a new instance after disposal", () => {
			const instance1 = ActivityDetector.getInstance()
			instance1.dispose()
			const instance2 = ActivityDetector.getInstance()
			expect(instance1).not.toBe(instance2)
		})
	})

	describe("Activity detection", () => {
		it("should detect activity on text document changes", () => {
			// Get the callback registered for text document changes
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Initially should not be active
			expect(detector.isUserActive()).toBe(false)

			// Simulate user typing (no reason means user input)
			onChangeCallback({
				reason: undefined,
				document: {} as any,
				contentChanges: [],
			})

			expect(detector.isUserActive()).toBe(true)
		})

		it("should detect activity on undo/redo operations", () => {
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Simulate undo operation
			onChangeCallback({
				reason: vscode.TextDocumentChangeReason.Undo,
				document: {} as any,
				contentChanges: [],
			})

			expect(detector.isUserActive()).toBe(true)
		})

		it("should detect activity on cursor movement", () => {
			const onSelectionCallback = vi.mocked(vscode.window.onDidChangeTextEditorSelection).mock.calls[0][0]

			// Simulate keyboard cursor movement
			onSelectionCallback({
				kind: vscode.TextEditorSelectionChangeKind.Keyboard,
				textEditor: {} as any,
				selections: [],
			})

			expect(detector.isUserActive()).toBe(true)
		})

		it("should detect activity on mouse selection", () => {
			const onSelectionCallback = vi.mocked(vscode.window.onDidChangeTextEditorSelection).mock.calls[0][0]

			// Simulate mouse selection
			onSelectionCallback({
				kind: vscode.TextEditorSelectionChangeKind.Mouse,
				textEditor: {} as any,
				selections: [],
			})

			expect(detector.isUserActive()).toBe(true)
		})

		it("should not detect activity on command-based selection changes", () => {
			const onSelectionCallback = vi.mocked(vscode.window.onDidChangeTextEditorSelection).mock.calls[0][0]

			// Simulate command-based selection (programmatic)
			onSelectionCallback({
				kind: vscode.TextEditorSelectionChangeKind.Command,
				textEditor: {} as any,
				selections: [],
			})

			expect(detector.isUserActive()).toBe(false)
		})

		it("should detect activity on active editor changes", () => {
			const onEditorChangeCallback = vi.mocked(vscode.window.onDidChangeActiveTextEditor).mock.calls[0][0]

			// Simulate editor change
			onEditorChangeCallback({} as any)

			expect(detector.isUserActive()).toBe(true)
		})
	})

	describe("Inactivity detection", () => {
		it("should report inactive after timeout period", () => {
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Trigger activity
			onChangeCallback({
				reason: undefined,
				document: {} as any,
				contentChanges: [],
			})

			expect(detector.isUserActive()).toBe(true)

			// Advance time by 1.5 seconds (less than timeout)
			vi.advanceTimersByTime(1500)
			expect(detector.isUserActive()).toBe(true)

			// Advance time by another 1 second (total 2.5 seconds, more than timeout)
			vi.advanceTimersByTime(1000)
			expect(detector.isUserActive()).toBe(false)
		})

		it("should return correct time since last activity", () => {
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Trigger activity
			onChangeCallback({
				reason: undefined,
				document: {} as any,
				contentChanges: [],
			})

			// Initially should be ~0
			expect(detector.getTimeSinceLastActivity()).toBeLessThan(10)

			// Advance time by 1 second
			vi.advanceTimersByTime(1000)
			expect(detector.getTimeSinceLastActivity()).toBeGreaterThanOrEqual(1000)
			expect(detector.getTimeSinceLastActivity()).toBeLessThan(1100)
		})
	})

	describe("waitForInactivity", () => {
		it("should resolve immediately if user is already inactive", async () => {
			// User is inactive by default
			const promise = detector.waitForInactivity(5000)

			// Advance timers slightly to process promise
			vi.advanceTimersByTime(100)

			const result = await promise
			expect(result).toBe(true)
		})

		it("should wait for user to become inactive", async () => {
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Make user active
			onChangeCallback({
				reason: undefined,
				document: {} as any,
				contentChanges: [],
			})

			const promise = detector.waitForInactivity(5000)

			// Advance time by 1.5 seconds (user still active)
			vi.advanceTimersByTime(1500)

			// Advance time by 1 second more (total 2.5 seconds, user now inactive)
			vi.advanceTimersByTime(1000)

			// Process promise resolution
			vi.advanceTimersByTime(100)

			const result = await promise
			expect(result).toBe(true)
		})

		it("should timeout if user remains active", async () => {
			const onChangeCallback = vi.mocked(vscode.workspace.onDidChangeTextDocument).mock.calls[0][0]

			// Make user active
			onChangeCallback({
				reason: undefined,
				document: {} as any,
				contentChanges: [],
			})

			const promise = detector.waitForInactivity(3000)

			// Keep user active by triggering activity every second
			const interval = setInterval(() => {
				onChangeCallback({
					reason: undefined,
					document: {} as any,
					contentChanges: [],
				})
			}, 1000)

			// Advance time beyond max wait time
			vi.advanceTimersByTime(3500)

			clearInterval(interval)

			const result = await promise
			expect(result).toBe(false)
		})
	})

	describe("dispose", () => {
		it("should dispose all event listeners", () => {
			detector.dispose()

			// Check that all disposables were called
			expect(mockDisposable.dispose).toHaveBeenCalledTimes(3) // One for each event listener
		})

		it("should clear the singleton instance", () => {
			detector.dispose()

			// After disposal, getInstance should create a new instance
			const newDetector = ActivityDetector.getInstance()
			expect(newDetector).not.toBe(detector)

			// Clean up
			newDetector.dispose()
		})
	})
})

describe("getActivityDetector", () => {
	afterEach(() => {
		ActivityDetector.getInstance().dispose()
	})

	it("should return an ActivityDetector instance", () => {
		const detector = getActivityDetector()
		expect(detector).toBeInstanceOf(ActivityDetector)
	})

	it("should return the same instance as getInstance", () => {
		const detector1 = getActivityDetector()
		const detector2 = ActivityDetector.getInstance()
		expect(detector1).toBe(detector2)
	})
})
