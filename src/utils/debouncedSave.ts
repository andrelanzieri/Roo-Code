/**
 * Utility for debounced saving of task messages to prevent excessive disk writes
 * during streaming operations.
 */

interface DebouncedSaveOptions {
	/**
	 * The delay in milliseconds before executing the save
	 */
	delay?: number
	/**
	 * Maximum time to wait before forcing a save
	 */
	maxWait?: number
}

export class DebouncedSave {
	private timer: NodeJS.Timeout | null = null
	private maxTimer: NodeJS.Timeout | null = null
	private pendingSave: (() => Promise<void>) | null = null
	private maxWaitStartTime: number = 0
	private readonly delay: number
	private readonly maxWait: number

	constructor(options: DebouncedSaveOptions = {}) {
		this.delay = options.delay ?? 1000 // Default 1 second debounce
		this.maxWait = options.maxWait ?? 5000 // Default 5 seconds max wait
	}

	/**
	 * Schedule a save operation with debouncing
	 */
	public schedule(saveFunction: () => Promise<void>): void {
		this.pendingSave = saveFunction

		// Clear existing timer
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}

		// Set up the debounced save
		this.timer = setTimeout(() => {
			this.executeSave()
		}, this.delay)

		// Set up max wait timer if not already running
		if (!this.maxTimer) {
			this.maxWaitStartTime = Date.now()
			this.maxTimer = setTimeout(() => {
				this.executeSave()
			}, this.maxWait)
		}
	}

	/**
	 * Execute the pending save immediately
	 */
	public async flush(): Promise<void> {
		// Clear timers
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		if (this.maxTimer) {
			clearTimeout(this.maxTimer)
			this.maxTimer = null
		}

		// Execute the save if pending
		if (this.pendingSave) {
			const saveFunction = this.pendingSave
			this.pendingSave = null
			this.maxWaitStartTime = 0

			try {
				await saveFunction()
			} catch (error) {
				console.error("Error during debounced save:", error)
				// Re-throw for flush to maintain error handling behavior
				throw error
			}
		}
	}

	/**
	 * Cancel any pending save operations
	 */
	public cancel(): void {
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		if (this.maxTimer) {
			clearTimeout(this.maxTimer)
			this.maxTimer = null
		}
		this.pendingSave = null
	}

	private async executeSave(): Promise<void> {
		// Clear timers
		if (this.timer) {
			clearTimeout(this.timer)
			this.timer = null
		}
		if (this.maxTimer) {
			clearTimeout(this.maxTimer)
			this.maxTimer = null
		}

		// Execute the save
		if (this.pendingSave) {
			const saveFunction = this.pendingSave
			this.pendingSave = null
			this.maxWaitStartTime = 0

			try {
				await saveFunction()
			} catch (error) {
				console.error("Error during debounced save:", error)
				// Don't re-throw for scheduled saves to prevent unhandled rejections
				// Re-throwing is only done in flush() for explicit error handling
			}
		}
	}

	/**
	 * Dispose of the debounced save instance
	 */
	public dispose(): void {
		this.cancel()
	}
}
