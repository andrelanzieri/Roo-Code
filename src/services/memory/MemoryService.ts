import * as path from "path"
import * as fs from "fs/promises"
import { createHash } from "crypto"
import { safeWriteJson } from "../../utils/safeWriteJson"

export interface Memory {
	id: string
	content: string
	summary: string
	timestamp: number
	taskId: string
	projectContext?: string
	conversationContext?: string
	relevanceScore?: number
	metadata?: {
		mode?: string
		tags?: string[]
		importance?: "low" | "medium" | "high"
	}
}

export interface MemorySearchResult {
	memory: Memory
	score: number
}

export class MemoryService {
	private static instance: MemoryService | undefined
	private memoriesPath: string
	private memories: Map<string, Memory> = new Map()
	private initialized = false
	private maxMemories = 1000 // Maximum number of memories to keep
	private memoryRetentionDays = 90 // Days to retain memories

	private constructor(globalStoragePath: string) {
		this.memoriesPath = path.join(globalStoragePath, ".roo-memory", "memories.json")
	}

	public static getInstance(globalStoragePath: string): MemoryService {
		if (!MemoryService.instance) {
			MemoryService.instance = new MemoryService(globalStoragePath)
		}
		return MemoryService.instance
	}

	public static resetInstance(): void {
		MemoryService.instance = undefined
	}

	private async ensureInitialized(): Promise<void> {
		if (this.initialized) {
			return
		}

		try {
			// Ensure directory exists
			const dir = path.dirname(this.memoriesPath)
			await fs.mkdir(dir, { recursive: true })

			// Load existing memories
			try {
				const data = await fs.readFile(this.memoriesPath, "utf-8")
				const memoriesArray: Memory[] = JSON.parse(data)

				// Clean up old memories
				const cutoffTime = Date.now() - this.memoryRetentionDays * 24 * 60 * 60 * 1000
				const validMemories = memoriesArray.filter((m) => m.timestamp > cutoffTime)

				// Store in map for quick access
				for (const memory of validMemories) {
					this.memories.set(memory.id, memory)
				}

				// Save cleaned memories if any were removed
				if (validMemories.length < memoriesArray.length) {
					await this.saveMemories()
				}
			} catch (error) {
				// File doesn't exist or is invalid, start fresh
				this.memories.clear()
			}

			this.initialized = true
		} catch (error) {
			console.error("Failed to initialize MemoryService:", error)
			throw error
		}
	}

	private async saveMemories(): Promise<void> {
		const memoriesArray = Array.from(this.memories.values())
			.sort((a, b) => b.timestamp - a.timestamp) // Most recent first
			.slice(0, this.maxMemories) // Keep only the most recent memories

		await safeWriteJson(this.memoriesPath, memoriesArray)
	}

	/**
	 * Store a new memory
	 */
	public async storeMemory(
		content: string,
		summary: string,
		taskId: string,
		projectContext?: string,
		metadata?: Memory["metadata"],
	): Promise<Memory> {
		await this.ensureInitialized()

		const id = createHash("sha256")
			.update(`${content}-${Date.now()}-${Math.random()}`)
			.digest("hex")
			.substring(0, 16)

		const memory: Memory = {
			id,
			content,
			summary,
			timestamp: Date.now(),
			taskId,
			projectContext,
			metadata,
		}

		this.memories.set(id, memory)
		await this.saveMemories()

		return memory
	}

	/**
	 * Search for relevant memories based on a query
	 */
	public async searchMemories(
		query: string,
		projectContext?: string,
		limit: number = 5,
	): Promise<MemorySearchResult[]> {
		await this.ensureInitialized()

		const results: MemorySearchResult[] = []
		const queryLower = query.toLowerCase()
		const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2)

		for (const memory of this.memories.values()) {
			// Skip if project context doesn't match (when specified)
			if (projectContext && memory.projectContext && memory.projectContext !== projectContext) {
				continue
			}

			// Calculate relevance score based on simple text matching
			// In a production system, this would use embeddings and vector similarity
			let score = 0
			const contentLower = (memory.content + " " + memory.summary).toLowerCase()

			// Check for exact query match
			if (contentLower.includes(queryLower)) {
				score += 10
			}

			// Check for individual word matches
			for (const word of queryWords) {
				if (contentLower.includes(word)) {
					score += 2
				}
			}

			// Boost score for recent memories
			const ageInDays = (Date.now() - memory.timestamp) / (1000 * 60 * 60 * 24)
			if (ageInDays < 1) {
				score += 5
			} else if (ageInDays < 7) {
				score += 3
			} else if (ageInDays < 30) {
				score += 1
			}

			// Boost for high importance
			if (memory.metadata?.importance === "high") {
				score += 3
			} else if (memory.metadata?.importance === "medium") {
				score += 1
			}

			if (score > 0) {
				results.push({ memory, score })
			}
		}

		// Sort by score and return top results
		return results.sort((a, b) => b.score - a.score).slice(0, limit)
	}

	/**
	 * Get all memories for a specific task
	 */
	public async getMemoriesForTask(taskId: string): Promise<Memory[]> {
		await this.ensureInitialized()

		return Array.from(this.memories.values())
			.filter((m) => m.taskId === taskId)
			.sort((a, b) => b.timestamp - a.timestamp)
	}

	/**
	 * Delete a specific memory
	 */
	public async deleteMemory(id: string): Promise<boolean> {
		await this.ensureInitialized()

		const deleted = this.memories.delete(id)
		if (deleted) {
			await this.saveMemories()
		}
		return deleted
	}

	/**
	 * Clear all memories
	 */
	public async clearAllMemories(): Promise<void> {
		await this.ensureInitialized()

		this.memories.clear()
		await this.saveMemories()
	}

	/**
	 * Get memory statistics
	 */
	public async getStats(): Promise<{
		totalMemories: number
		oldestMemory?: Date
		newestMemory?: Date
		memoryByProject: Map<string, number>
	}> {
		await this.ensureInitialized()

		const memories = Array.from(this.memories.values())
		const memoryByProject = new Map<string, number>()

		for (const memory of memories) {
			if (memory.projectContext) {
				const count = memoryByProject.get(memory.projectContext) || 0
				memoryByProject.set(memory.projectContext, count + 1)
			}
		}

		const timestamps = memories.map((m) => m.timestamp).sort((a, b) => a - b)

		return {
			totalMemories: memories.length,
			oldestMemory: timestamps[0] ? new Date(timestamps[0]) : undefined,
			newestMemory: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]) : undefined,
			memoryByProject,
		}
	}
}
