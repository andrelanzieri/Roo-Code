import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import { MemoryService } from "../MemoryService"

// Mock fs/promises
vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	readFile: vi.fn(),
	writeFile: vi.fn(),
}))

// Mock safeWriteJson
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(),
}))

describe("MemoryService", () => {
	let memoryService: MemoryService
	const testStoragePath = "/test/storage/path"

	beforeEach(() => {
		// Reset the singleton instance
		MemoryService.resetInstance()
		memoryService = MemoryService.getInstance(testStoragePath)

		// Setup default mocks
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found")) // Start with no existing memories
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("storeMemory", () => {
		it("should store a new memory", async () => {
			const content = "This is the conversation content"
			const summary = "Test conversation summary"
			const taskId = "test-task-123"
			const projectContext = "/test/project"

			const memory = await memoryService.storeMemory(content, summary, taskId, projectContext, {
				mode: "code",
				importance: "high",
				tags: ["test"],
			})

			expect(memory).toMatchObject({
				content,
				summary,
				taskId,
				projectContext,
				metadata: {
					mode: "code",
					importance: "high",
					tags: ["test"],
				},
			})
			expect(memory.id).toBeDefined()
			expect(memory.timestamp).toBeDefined()
		})

		it("should handle storage errors gracefully", async () => {
			const { safeWriteJson } = await import("../../../utils/safeWriteJson")
			vi.mocked(safeWriteJson).mockRejectedValue(new Error("Write failed"))

			// Should not throw even if save fails
			await expect(memoryService.storeMemory("content", "summary", "task-id")).resolves.toBeDefined()
		})
	})

	describe("searchMemories", () => {
		it("should search memories by query", async () => {
			// Setup existing memories
			const existingMemories = [
				{
					id: "1",
					content: "Authentication implementation with OAuth2",
					summary: "Implemented OAuth2 authentication",
					timestamp: Date.now(),
					taskId: "task-1",
					projectContext: "/test/project",
					metadata: { importance: "high" },
				},
				{
					id: "2",
					content: "Database schema design for users table",
					summary: "Designed user database schema",
					timestamp: Date.now() - 86400000, // 1 day ago
					taskId: "task-2",
					projectContext: "/test/project",
				},
				{
					id: "3",
					content: "Fixed bug in payment processing",
					summary: "Payment bug fix",
					timestamp: Date.now() - 172800000, // 2 days ago
					taskId: "task-3",
					projectContext: "/other/project",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			// Re-initialize to load existing memories
			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const results = await memoryService.searchMemories("authentication OAuth2", "/test/project")

			expect(results).toHaveLength(1)
			expect(results[0].memory.id).toBe("1")
			expect(results[0].score).toBeGreaterThan(0)
		})

		it("should filter by project context", async () => {
			const existingMemories = [
				{
					id: "1",
					content: "Project A content",
					summary: "Summary A",
					timestamp: Date.now(),
					taskId: "task-1",
					projectContext: "/project/a",
				},
				{
					id: "2",
					content: "Project B content",
					summary: "Summary B",
					timestamp: Date.now(),
					taskId: "task-2",
					projectContext: "/project/b",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const results = await memoryService.searchMemories("content", "/project/a")

			expect(results).toHaveLength(1)
			expect(results[0].memory.projectContext).toBe("/project/a")
		})

		it("should boost recent memories", async () => {
			const now = Date.now()
			const existingMemories = [
				{
					id: "old",
					content: "test content",
					summary: "Old memory",
					timestamp: now - 35 * 24 * 60 * 60 * 1000, // 35 days ago
					taskId: "task-1",
				},
				{
					id: "recent",
					content: "test content",
					summary: "Recent memory",
					timestamp: now - 60 * 60 * 1000, // 1 hour ago
					taskId: "task-2",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const results = await memoryService.searchMemories("test")

			expect(results).toHaveLength(2)
			// Recent memory should have higher score
			expect(results[0].memory.id).toBe("recent")
			expect(results[0].score).toBeGreaterThan(results[1].score)
		})
	})

	describe("getMemoriesForTask", () => {
		it("should retrieve all memories for a specific task", async () => {
			const existingMemories = [
				{
					id: "1",
					content: "Content 1",
					summary: "Summary 1",
					timestamp: Date.now(),
					taskId: "task-123",
				},
				{
					id: "2",
					content: "Content 2",
					summary: "Summary 2",
					timestamp: Date.now() - 1000,
					taskId: "task-123",
				},
				{
					id: "3",
					content: "Content 3",
					summary: "Summary 3",
					timestamp: Date.now(),
					taskId: "task-456",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const memories = await memoryService.getMemoriesForTask("task-123")

			expect(memories).toHaveLength(2)
			expect(memories.every((m) => m.taskId === "task-123")).toBe(true)
			// Should be sorted by timestamp (most recent first)
			expect(memories[0].id).toBe("1")
			expect(memories[1].id).toBe("2")
		})
	})

	describe("deleteMemory", () => {
		it("should delete a specific memory", async () => {
			const existingMemories = [
				{
					id: "1",
					content: "Content 1",
					summary: "Summary 1",
					timestamp: Date.now(),
					taskId: "task-1",
				},
				{
					id: "2",
					content: "Content 2",
					summary: "Summary 2",
					timestamp: Date.now(),
					taskId: "task-2",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const deleted = await memoryService.deleteMemory("1")

			expect(deleted).toBe(true)

			// Verify memory is removed
			const memories = await memoryService.getMemoriesForTask("task-1")
			expect(memories).toHaveLength(0)
		})

		it("should return false when deleting non-existent memory", async () => {
			const deleted = await memoryService.deleteMemory("non-existent")
			expect(deleted).toBe(false)
		})
	})

	describe("clearAllMemories", () => {
		it("should clear all memories", async () => {
			const existingMemories = [
				{
					id: "1",
					content: "Content 1",
					summary: "Summary 1",
					timestamp: Date.now(),
					taskId: "task-1",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			await memoryService.clearAllMemories()

			const results = await memoryService.searchMemories("Content")
			expect(results).toHaveLength(0)
		})
	})

	describe("getStats", () => {
		it("should return memory statistics", async () => {
			const now = Date.now()
			const existingMemories = [
				{
					id: "1",
					content: "Content 1",
					summary: "Summary 1",
					timestamp: now - 86400000, // 1 day ago
					taskId: "task-1",
					projectContext: "/project/a",
				},
				{
					id: "2",
					content: "Content 2",
					summary: "Summary 2",
					timestamp: now,
					taskId: "task-2",
					projectContext: "/project/a",
				},
				{
					id: "3",
					content: "Content 3",
					summary: "Summary 3",
					timestamp: now - 172800000, // 2 days ago
					taskId: "task-3",
					projectContext: "/project/b",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			const stats = await memoryService.getStats()

			expect(stats.totalMemories).toBe(3)
			expect(stats.oldestMemory).toEqual(new Date(now - 172800000))
			expect(stats.newestMemory).toEqual(new Date(now))
			expect(stats.memoryByProject.get("/project/a")).toBe(2)
			expect(stats.memoryByProject.get("/project/b")).toBe(1)
		})
	})

	describe("memory retention", () => {
		it("should clean up old memories on initialization", async () => {
			const now = Date.now()
			const existingMemories = [
				{
					id: "old",
					content: "Old content",
					summary: "Old summary",
					timestamp: now - 100 * 24 * 60 * 60 * 1000, // 100 days ago (older than retention)
					taskId: "task-1",
				},
				{
					id: "recent",
					content: "Recent content",
					summary: "Recent summary",
					timestamp: now - 10 * 24 * 60 * 60 * 1000, // 10 days ago
					taskId: "task-2",
				},
			]

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(existingMemories))

			MemoryService.resetInstance()
			memoryService = MemoryService.getInstance(testStoragePath)

			// Wait for initialization
			const memories = await memoryService.searchMemories("")

			// Old memory should be filtered out
			expect(memories.every((m) => m.memory.id !== "old")).toBe(true)
		})
	})
})
