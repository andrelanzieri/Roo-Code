import * as fs from "fs/promises"
import * as path from "path"
import { v4 as uuidv4 } from "uuid"
import { safeWriteJson } from "../../utils/safeWriteJson"

/**
 * Represents a single cost entry in the ledger
 */
export interface CostEntry {
	entry_id: string
	task_id: string
	origin_task_id?: string
	root_task_id?: string
	provider: string
	model_id: string
	feature: string
	tokens_in: number
	tokens_out: number
	cache_writes?: number
	cache_reads?: number
	cost: number
	timestamp: string
}

/**
 * Model breakdown for cost reporting
 */
export interface ModelCostBreakdown {
	provider: string
	model_id: string
	total_cost: number
	total_tokens_in: number
	total_tokens_out: number
	total_cache_writes: number
	total_cache_reads: number
	entry_count: number
}

/**
 * CostLedger manages persistent cost tracking across model switches
 * Uses Write-Ahead Logging (WAL) for crash safety
 */
export class CostLedger {
	private entries: CostEntry[] = []
	private walPath: string
	private snapshotPath: string
	private walFileHandle: fs.FileHandle | null = null
	private snapshotInterval = 100 // Snapshot every 100 entries
	private isInitialized = false

	constructor(private storagePath: string) {
		this.walPath = path.join(storagePath, "cost-ledger-wal.jsonl")
		this.snapshotPath = path.join(storagePath, "cost-ledger.json")
	}

	/**
	 * Initialize the ledger by loading existing data
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return
		}

		try {
			// Ensure storage directory exists
			await fs.mkdir(this.storagePath, { recursive: true })

			// Load snapshot if exists
			await this.loadSnapshot()

			// Replay WAL entries after snapshot
			await this.replayWAL()

			// Open WAL file for appending
			try {
				this.walFileHandle = await fs.open(this.walPath, "a")
			} catch (error: any) {
				// If file doesn't exist, create it
				if (error.code === "ENOENT") {
					await fs.writeFile(this.walPath, "")
					this.walFileHandle = await fs.open(this.walPath, "a")
				} else {
					throw error
				}
			}

			this.isInitialized = true
		} catch (error) {
			console.error("Failed to initialize CostLedger:", error)
			throw error
		}
	}

	/**
	 * Append a new cost entry to the ledger
	 */
	async appendEntry(params: {
		task_id: string
		origin_task_id?: string
		root_task_id?: string
		provider: string
		model_id: string
		feature: string
		tokens_in: number
		tokens_out: number
		cache_writes?: number
		cache_reads?: number
		cost: number
	}): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const entry: CostEntry = {
			entry_id: uuidv4(),
			timestamp: new Date().toISOString(),
			...params,
		}

		// Append to WAL first (for durability)
		await this.appendToWAL(entry)

		// Add to in-memory entries
		this.entries.push(entry)

		// Check if we need to create a snapshot
		if (this.entries.length % this.snapshotInterval === 0) {
			await this.createSnapshot()
		}
	}

	/**
	 * Get cumulative total cost across all models
	 */
	getCumulativeTotal(): number {
		return this.entries.reduce((total, entry) => total + entry.cost, 0)
	}

	/**
	 * Get breakdown of costs by model
	 */
	getBreakdownByModel(): Record<
		string,
		{
			provider: string
			tokens_in: number
			tokens_out: number
			cache_writes: number
			cache_reads: number
			cost: number
			count: number
		}
	> {
		const breakdown: Record<string, any> = {}

		for (const entry of this.entries) {
			const key = entry.model_id
			if (!breakdown[key]) {
				breakdown[key] = {
					provider: entry.provider,
					tokens_in: 0,
					tokens_out: 0,
					cache_writes: 0,
					cache_reads: 0,
					cost: 0,
					count: 0,
				}
			}

			breakdown[key].tokens_in += entry.tokens_in
			breakdown[key].tokens_out += entry.tokens_out
			breakdown[key].cache_writes += entry.cache_writes || 0
			breakdown[key].cache_reads += entry.cache_reads || 0
			breakdown[key].cost += entry.cost
			breakdown[key].count += 1
		}

		return breakdown
	}

	/**
	 * Get all entries for a specific task
	 */
	getEntriesForTask(taskId: string): CostEntry[] {
		return this.entries.filter(
			(entry) => entry.task_id === taskId || entry.origin_task_id === taskId || entry.root_task_id === taskId,
		)
	}

	/**
	 * Get total metrics (for UI display)
	 */
	getTotalMetrics(): {
		totalTokensIn: number
		totalTokensOut: number
		totalCacheWrites: number
		totalCacheReads: number
		totalCost: number
	} {
		const metrics = {
			totalTokensIn: 0,
			totalTokensOut: 0,
			totalCacheWrites: 0,
			totalCacheReads: 0,
			totalCost: 0,
		}

		for (const entry of this.entries) {
			metrics.totalTokensIn += entry.tokens_in
			metrics.totalTokensOut += entry.tokens_out
			metrics.totalCacheWrites += entry.cache_writes || 0
			metrics.totalCacheReads += entry.cache_reads || 0
			metrics.totalCost += entry.cost
		}

		return metrics
	}

	/**
	 * Clear the ledger (for new tasks)
	 */
	async clear(): Promise<void> {
		this.entries = []

		// Close and truncate WAL
		if (this.walFileHandle) {
			await this.walFileHandle.close()
		}
		await fs.writeFile(this.walPath, "")
		this.walFileHandle = await fs.open(this.walPath, "a")

		// Remove snapshot
		try {
			await fs.unlink(this.snapshotPath)
		} catch (error) {
			// Ignore if file doesn't exist
		}
	}

	/**
	 * Close the ledger (cleanup)
	 */
	async close(): Promise<void> {
		// Save a final snapshot before closing
		if (this.entries.length > 0) {
			await this.createSnapshot()
		}

		if (this.walFileHandle) {
			await this.walFileHandle.close()
			this.walFileHandle = null
		}
		this.isInitialized = false
	}

	/**
	 * Append entry to WAL file
	 */
	private async appendToWAL(entry: CostEntry): Promise<void> {
		if (!this.walFileHandle) {
			throw new Error("WAL file handle not initialized")
		}

		const line = JSON.stringify(entry) + "\n"
		await this.walFileHandle.write(line)
	}

	/**
	 * Load snapshot from disk
	 */
	private async loadSnapshot(): Promise<void> {
		try {
			const data = await fs.readFile(this.snapshotPath, "utf-8")
			const snapshot = JSON.parse(data)
			if (Array.isArray(snapshot)) {
				this.entries = snapshot
			}
		} catch (error) {
			// Snapshot doesn't exist or is corrupted, start fresh
			this.entries = []
		}
	}

	/**
	 * Replay WAL entries after snapshot
	 */
	private async replayWAL(): Promise<void> {
		try {
			const walContent = await fs.readFile(this.walPath, "utf-8")
			const lines = walContent.split("\n").filter((line) => line.trim())

			// Get the last entry ID from snapshot
			const lastSnapshotEntryId = this.entries.length > 0 ? this.entries[this.entries.length - 1].entry_id : null

			let foundSnapshot = !lastSnapshotEntryId
			for (const line of lines) {
				try {
					const entry = JSON.parse(line) as CostEntry

					// Skip entries until we find the one after snapshot
					if (!foundSnapshot) {
						if (entry.entry_id === lastSnapshotEntryId) {
							foundSnapshot = true
						}
						continue
					}

					// Add entries after snapshot
					if (!this.entries.find((e) => e.entry_id === entry.entry_id)) {
						this.entries.push(entry)
					}
				} catch (error) {
					// Skip malformed lines
					console.warn("Skipping malformed WAL entry:", line)
				}
			}
		} catch (error) {
			// WAL doesn't exist, that's fine
		}
	}

	/**
	 * Create a snapshot of current entries
	 */
	private async createSnapshot(): Promise<void> {
		await safeWriteJson(this.snapshotPath, this.entries)

		// Truncate WAL after successful snapshot
		if (this.walFileHandle) {
			await this.walFileHandle.close()
		}
		await fs.writeFile(this.walPath, "")
		this.walFileHandle = await fs.open(this.walPath, "a")
	}
}
