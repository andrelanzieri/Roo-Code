import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as path from "path"
import { CostLedger } from "../CostLedger"
import type { CostEntry } from "../CostLedger"

// Mock fs/promises
vi.mock("fs/promises", () => ({
	mkdir: vi.fn().mockResolvedValue(undefined),
	readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
	writeFile: vi.fn().mockResolvedValue(undefined),
	appendFile: vi.fn().mockResolvedValue(undefined),
	unlink: vi.fn().mockResolvedValue(undefined),
	access: vi.fn().mockResolvedValue(undefined),
	open: vi.fn().mockResolvedValue({
		write: vi.fn().mockResolvedValue({ bytesWritten: 0 }),
		close: vi.fn().mockResolvedValue(undefined),
	}),
}))

// Mock safeWriteJson
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn().mockResolvedValue(undefined),
}))

import * as fs from "fs/promises"
import { safeWriteJson } from "../../../utils/safeWriteJson"

describe("CostLedger", () => {
	let ledger: CostLedger
	const testDir = "/test/cost-ledger"
	const walPath = path.join(testDir, "cost-ledger-wal.jsonl")
	const snapshotPath = path.join(testDir, "cost-ledger.json")

	beforeEach(() => {
		vi.clearAllMocks()
		// Reset mocks to default behavior
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		vi.mocked(fs.readFile).mockRejectedValue(new Error("ENOENT"))
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		vi.mocked(fs.appendFile).mockResolvedValue(undefined)
		vi.mocked(fs.unlink).mockResolvedValue(undefined)
		vi.mocked(fs.open).mockResolvedValue({
			write: vi.fn().mockResolvedValue({ bytesWritten: 0 }),
			close: vi.fn().mockResolvedValue(undefined),
		} as any)

		ledger = new CostLedger(testDir)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("appendEntry", () => {
		it("should append a cost entry and update totals", async () => {
			await ledger.initialize()

			const entry: Omit<CostEntry, "entry_id"> = {
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
				timestamp: new Date().toISOString(),
			}

			await ledger.appendEntry(entry)

			const metrics = ledger.getTotalMetrics()
			expect(metrics.totalTokensIn).toBe(100)
			expect(metrics.totalTokensOut).toBe(50)
			expect(metrics.totalCacheWrites).toBe(10)
			expect(metrics.totalCacheReads).toBe(5)
			expect(metrics.totalCost).toBe(0.015)
		})

		it("should accumulate multiple entries", async () => {
			await ledger.initialize()

			const entry1: Omit<CostEntry, "entry_id"> = {
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
				timestamp: new Date().toISOString(),
			}

			const entry2: Omit<CostEntry, "entry_id"> = {
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "openai",
				model_id: "gpt-4",
				feature: "chat",
				tokens_in: 200,
				tokens_out: 100,
				cache_writes: 0,
				cache_reads: 0,
				cost: 0.025,
				timestamp: new Date().toISOString(),
			}

			await ledger.appendEntry(entry1)
			await ledger.appendEntry(entry2)

			const metrics = ledger.getTotalMetrics()
			expect(metrics.totalTokensIn).toBe(300)
			expect(metrics.totalTokensOut).toBe(150)
			expect(metrics.totalCacheWrites).toBe(10)
			expect(metrics.totalCacheReads).toBe(5)
			expect(metrics.totalCost).toBe(0.04)
		})

		it("should write to WAL file", async () => {
			await ledger.initialize()

			const entry: Omit<CostEntry, "entry_id"> = {
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
				timestamp: new Date().toISOString(),
			}

			await ledger.appendEntry(entry)

			// Check that the WAL file handle was used
			const mockFileHandle = await vi.mocked(fs.open).mock.results[0]?.value
			expect(mockFileHandle?.write).toHaveBeenCalled()
		})
	})

	describe("getCumulativeTotal", () => {
		it("should return cumulative total cost", async () => {
			await ledger.initialize()

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
			})

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "openai",
				model_id: "gpt-4",
				feature: "chat",
				tokens_in: 200,
				tokens_out: 100,
				cache_writes: 0,
				cache_reads: 0,
				cost: 0.025,
			})

			expect(ledger.getCumulativeTotal()).toBe(0.04)
		})

		it("should return 0 when no entries", async () => {
			await ledger.initialize()
			expect(ledger.getCumulativeTotal()).toBe(0)
		})
	})

	describe("getBreakdownByModel", () => {
		it("should return breakdown by model", async () => {
			await ledger.initialize()

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
			})

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 50,
				tokens_out: 25,
				cache_writes: 5,
				cache_reads: 2,
				cost: 0.008,
			})

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "openai",
				model_id: "gpt-4",
				feature: "chat",
				tokens_in: 200,
				tokens_out: 100,
				cache_writes: 0,
				cache_reads: 0,
				cost: 0.025,
			})

			const breakdown = ledger.getBreakdownByModel()

			expect((breakdown as any)["claude-3-opus"]).toEqual({
				provider: "anthropic",
				tokens_in: 150,
				tokens_out: 75,
				cache_writes: 15,
				cache_reads: 7,
				cost: 0.023,
				count: 2,
			})

			expect((breakdown as any)["gpt-4"]).toEqual({
				provider: "openai",
				tokens_in: 200,
				tokens_out: 100,
				cache_writes: 0,
				cache_reads: 0,
				cost: 0.025,
				count: 1,
			})
		})

		it("should return empty object when no entries", async () => {
			await ledger.initialize()
			const breakdown = ledger.getBreakdownByModel()
			expect(breakdown).toEqual({})
		})
	})

	describe("getTotalMetrics", () => {
		it("should return total metrics", async () => {
			await ledger.initialize()

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
			})

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "openai",
				model_id: "gpt-4",
				feature: "chat",
				tokens_in: 200,
				tokens_out: 100,
				cache_writes: 20,
				cache_reads: 10,
				cost: 0.025,
			})

			const metrics = ledger.getTotalMetrics()

			expect(metrics).toEqual({
				totalTokensIn: 300,
				totalTokensOut: 150,
				totalCacheWrites: 30,
				totalCacheReads: 15,
				totalCost: 0.04,
			})
		})

		it("should return zeros when no entries", async () => {
			await ledger.initialize()
			const metrics = ledger.getTotalMetrics()

			expect(metrics).toEqual({
				totalTokensIn: 0,
				totalTokensOut: 0,
				totalCacheWrites: 0,
				totalCacheReads: 0,
				totalCost: 0,
			})
		})
	})

	describe("persistence", () => {
		it("should load from snapshot on initialization", async () => {
			const existingData = [
				{
					entry_id: "entry-1",
					task_id: "task-123",
					origin_task_id: "task-123",
					root_task_id: "task-123",
					provider: "anthropic",
					model_id: "claude-3-opus",
					feature: "chat",
					tokens_in: 100,
					tokens_out: 50,
					cache_writes: 10,
					cache_reads: 5,
					cost: 0.015,
					timestamp: new Date().toISOString(),
				},
			]

			vi.mocked(fs.readFile).mockImplementation((filePath) => {
				if (filePath === snapshotPath) {
					return Promise.resolve(JSON.stringify(existingData))
				}
				return Promise.reject(new Error("ENOENT"))
			})

			const newLedger = new CostLedger(testDir)
			await newLedger.initialize()

			const metrics = newLedger.getTotalMetrics()
			expect(metrics.totalTokensIn).toBe(100)
			expect(metrics.totalTokensOut).toBe(50)
			expect(metrics.totalCost).toBe(0.015)
		})

		it("should recover from WAL if snapshot is missing", async () => {
			const walEntries = [
				JSON.stringify({
					entry_id: "entry-1",
					task_id: "task-123",
					origin_task_id: "task-123",
					root_task_id: "task-123",
					provider: "anthropic",
					model_id: "claude-3-opus",
					feature: "chat",
					tokens_in: 100,
					tokens_out: 50,
					cache_writes: 10,
					cache_reads: 5,
					cost: 0.015,
					timestamp: new Date().toISOString(),
				}),
				JSON.stringify({
					entry_id: "entry-2",
					task_id: "task-123",
					origin_task_id: "task-123",
					root_task_id: "task-123",
					provider: "openai",
					model_id: "gpt-4",
					feature: "chat",
					tokens_in: 200,
					tokens_out: 100,
					cache_writes: 0,
					cache_reads: 10,
					cost: 0.025,
					timestamp: new Date().toISOString(),
				}),
			].join("\n")

			vi.mocked(fs.readFile).mockImplementation((filePath) => {
				if (filePath === walPath) {
					return Promise.resolve(walEntries)
				}
				return Promise.reject(new Error("ENOENT"))
			})

			const newLedger = new CostLedger(testDir)
			await newLedger.initialize()

			const metrics = newLedger.getTotalMetrics()
			expect(metrics.totalTokensIn).toBe(300)
			expect(metrics.totalTokensOut).toBe(150)
			expect(metrics.totalCacheReads).toBe(15)
			expect(metrics.totalCost).toBe(0.04)
		})

		it("should create snapshot after 100 entries", async () => {
			await ledger.initialize()

			// Add 101 entries to trigger snapshot
			for (let i = 0; i < 101; i++) {
				await ledger.appendEntry({
					task_id: "task-123",
					origin_task_id: "task-123",
					root_task_id: "task-123",
					provider: "anthropic",
					model_id: "claude-3-opus",
					feature: "chat",
					tokens_in: 10,
					tokens_out: 5,
					cache_writes: 1,
					cache_reads: 1,
					cost: 0.001,
				})
			}

			// Wait for async operations
			await new Promise((resolve) => setTimeout(resolve, 50))

			// Should have created a snapshot
			expect(safeWriteJson).toHaveBeenCalledWith(
				snapshotPath,
				expect.arrayContaining([
					expect.objectContaining({
						task_id: "task-123",
					}),
				]),
			)
		})
	})

	describe("close", () => {
		it("should save snapshot when closing", async () => {
			await ledger.initialize()

			await ledger.appendEntry({
				task_id: "task-123",
				origin_task_id: "task-123",
				root_task_id: "task-123",
				provider: "anthropic",
				model_id: "claude-3-opus",
				feature: "chat",
				tokens_in: 100,
				tokens_out: 50,
				cache_writes: 10,
				cache_reads: 5,
				cost: 0.015,
			})

			await ledger.close()

			// Should have saved a snapshot
			expect(safeWriteJson).toHaveBeenCalledWith(
				snapshotPath,
				expect.arrayContaining([
					expect.objectContaining({
						task_id: "task-123",
					}),
				]),
			)
		})
	})
})
