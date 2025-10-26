import * as vscode from "vscode"

/**
 * ActivityDetector tracks user activity in the editor to prevent disruption
 * when the user is actively typing or editing.
 */
export class ActivityDetector {
	private static instance: ActivityDetector | undefined
	private lastActivityTime: number = 0
	private disposables: vscode.Disposable[] = []
	private readonly ACTIVITY_TIMEOUT_MS = 2000 // Consider user inactive after 2 seconds

	private constructor() {
		this.setupListeners()
	}

	/**
	 * Get the singleton instance of ActivityDetector
	 */
	static getInstance(): ActivityDetector {
		if (!ActivityDetector.instance) {
			ActivityDetector.instance = new ActivityDetector()
		}
		return ActivityDetector.instance
	}

	/**
	 * Setup event listeners to track user activity
	 */
	private setupListeners() {
		// Track text document changes (typing)
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				// Only track changes from user input, not programmatic changes
				if (
					event.reason === undefined ||
					event.reason === vscode.TextDocumentChangeReason.Undo ||
					event.reason === vscode.TextDocumentChangeReason.Redo
				) {
					this.updateActivityTime()
				}
			}),
		)

		// Track selection changes (cursor movement)
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) => {
				// Only track if the change was triggered by keyboard or mouse
				if (
					event.kind === vscode.TextEditorSelectionChangeKind.Keyboard ||
					event.kind === vscode.TextEditorSelectionChangeKind.Mouse
				) {
					this.updateActivityTime()
				}
			}),
		)

		// Track active editor changes
		this.disposables.push(
			vscode.window.onDidChangeActiveTextEditor(() => {
				this.updateActivityTime()
			}),
		)
	}

	/**
	 * Update the last activity timestamp
	 */
	private updateActivityTime() {
		this.lastActivityTime = Date.now()
	}

	/**
	 * Check if the user is currently active (has been active within the timeout period)
	 */
	isUserActive(): boolean {
		return Date.now() - this.lastActivityTime < this.ACTIVITY_TIMEOUT_MS
	}

	/**
	 * Get the time in milliseconds since the last user activity
	 */
	getTimeSinceLastActivity(): number {
		return Date.now() - this.lastActivityTime
	}

	/**
	 * Wait for user to become inactive before proceeding
	 * @param maxWaitMs Maximum time to wait in milliseconds (default: 5000ms)
	 * @returns Promise that resolves when user becomes inactive or timeout is reached
	 */
	async waitForInactivity(maxWaitMs: number = 5000): Promise<boolean> {
		const startTime = Date.now()

		while (this.isUserActive()) {
			// Check if we've exceeded max wait time
			if (Date.now() - startTime > maxWaitMs) {
				return false // Timeout reached, user still active
			}

			// Wait a bit before checking again
			await new Promise((resolve) => setTimeout(resolve, 100))
		}

		return true // User is now inactive
	}

	/**
	 * Dispose of all event listeners
	 */
	dispose() {
		this.disposables.forEach((d) => d.dispose())
		this.disposables = []
		ActivityDetector.instance = undefined
	}
}

/**
 * Get the global activity detector instance
 */
export function getActivityDetector(): ActivityDetector {
	return ActivityDetector.getInstance()
}
