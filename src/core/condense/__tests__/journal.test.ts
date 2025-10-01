import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import {
	type CondenseJournalEntry,
	type CondenseJournal,
	readJournal,
	writeJournal,
	appendJournalEntry,
	createJournalEntry,
	restoreMessagesForTimestamp,
	findRemovedMessages,
	getJournalPath,
} from "../journal"
import { type ApiMessage } from "../../task-persistence"

// Mock safeWriteJson
vi.mock("../../../utils/safeWriteJson", () => ({
	safeWriteJson: vi.fn(async (filePath: string, data: any) => {
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
	}),
}))

describe("Condense Journal", () => {
	let testDir: string

	beforeEach(async () => {
		// Create a temporary test directory
		testDir = path.join(os.tmpdir(), `journal-test-${Date.now()}`)
		await fs.mkdir(testDir, { recursive: true })
	})

	afterEach(async () => {
		// Clean up test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true })
		} catch (error) {
			// Ignore cleanup errors
		}
	})

	describe("getJournalPath", () => {
		it("should return the correct journal path", () => {
			const journalPath = getJournalPath(testDir)
			expect(journalPath).toBe(path.join(testDir, "condense_journal.json"))
		})
	})

	describe("readJournal", () => {
		it("should return null when journal doesn't exist", async () => {
			const journal = await readJournal(testDir)
			expect(journal).toBeNull()
		})

		it("should read existing journal", async () => {
			const testJournal: CondenseJournal = {
				version: 1,
				entries: [
					{
						removed: [{ role: "user", content: "test", ts: 1000 }],
						boundary: { firstKeptTs: 900, lastKeptTs: 1100, summaryTs: 1050 },
						createdAt: Date.now(),
						type: "manual",
					},
				],
			}

			const journalPath = getJournalPath(testDir)
			await fs.writeFile(journalPath, JSON.stringify(testJournal), "utf-8")

			const journal = await readJournal(testDir)
			expect(journal).toEqual(testJournal)
		})

		it("should handle corrupted journal file gracefully", async () => {
			const journalPath = getJournalPath(testDir)
			await fs.writeFile(journalPath, "invalid json", "utf-8")

			const journal = await readJournal(testDir)
			expect(journal).toBeNull()
		})
	})

	describe("writeJournal", () => {
		it("should write journal to disk", async () => {
			const testJournal: CondenseJournal = {
				version: 1,
				entries: [
					{
						removed: [{ role: "assistant", content: "response", ts: 2000 }],
						boundary: { firstKeptTs: 1900, lastKeptTs: 2100 },
						createdAt: Date.now(),
						type: "auto",
					},
				],
			}

			await writeJournal(testDir, testJournal)

			const journalPath = getJournalPath(testDir)
			const content = await fs.readFile(journalPath, "utf-8")
			const savedJournal = JSON.parse(content)
			expect(savedJournal).toEqual(testJournal)
		})
	})

	describe("appendJournalEntry", () => {
		it("should create new journal if none exists", async () => {
			const entry: CondenseJournalEntry = {
				removed: [{ role: "user", content: "test message", ts: 3000 }],
				boundary: { firstKeptTs: 2900, summaryTs: 3050 },
				createdAt: Date.now(),
				type: "manual",
			}

			await appendJournalEntry(testDir, entry)

			const journal = await readJournal(testDir)
			expect(journal).not.toBeNull()
			expect(journal?.version).toBe(1)
			expect(journal?.entries).toHaveLength(1)
			expect(journal?.entries[0]).toEqual(entry)
		})

		it("should append to existing journal", async () => {
			const existingEntry: CondenseJournalEntry = {
				removed: [{ role: "user", content: "old message", ts: 1000 }],
				boundary: { firstKeptTs: 900 },
				createdAt: Date.now() - 10000,
				type: "manual",
			}

			const newEntry: CondenseJournalEntry = {
				removed: [{ role: "assistant", content: "new message", ts: 2000 }],
				boundary: { lastKeptTs: 2100 },
				createdAt: Date.now(),
				type: "auto",
			}

			// Create initial journal
			await writeJournal(testDir, { version: 1, entries: [existingEntry] })

			// Append new entry
			await appendJournalEntry(testDir, newEntry)

			const journal = await readJournal(testDir)
			expect(journal?.entries).toHaveLength(2)
			expect(journal?.entries[0]).toEqual(existingEntry)
			expect(journal?.entries[1]).toEqual(newEntry)
		})
	})

	describe("createJournalEntry", () => {
		it("should create journal entry with all fields", () => {
			const removed: ApiMessage[] = [
				{ role: "user", content: "message 1", ts: 1000 },
				{ role: "assistant", content: "message 2", ts: 1100 },
			]
			const firstKept: ApiMessage = { role: "user", content: "first kept", ts: 900 }
			const lastKept: ApiMessage = { role: "assistant", content: "last kept", ts: 1200 }
			const summary: ApiMessage = { role: "assistant", content: "summary", ts: 1150, isSummary: true }

			const entry = createJournalEntry(removed, firstKept, lastKept, summary, "manual")

			expect(entry.removed).toEqual(removed)
			expect(entry.boundary.firstKeptTs).toBe(900)
			expect(entry.boundary.lastKeptTs).toBe(1200)
			expect(entry.boundary.summaryTs).toBe(1150)
			expect(entry.type).toBe("manual")
			expect(entry.createdAt).toBeGreaterThan(0)
		})

		it("should handle undefined boundary messages", () => {
			const removed: ApiMessage[] = [{ role: "user", content: "message", ts: 1000 }]

			const entry = createJournalEntry(removed, undefined, undefined, undefined, "auto")

			expect(entry.removed).toEqual(removed)
			expect(entry.boundary.firstKeptTs).toBeUndefined()
			expect(entry.boundary.lastKeptTs).toBeUndefined()
			expect(entry.boundary.summaryTs).toBeUndefined()
			expect(entry.type).toBe("auto")
		})
	})

	describe("findRemovedMessages", () => {
		it("should identify removed messages correctly", () => {
			const original: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "msg2", ts: 1100 },
				{ role: "user", content: "msg3", ts: 1200 },
				{ role: "assistant", content: "msg4", ts: 1300 },
			]

			const condensed: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "summary", ts: 1150, isSummary: true },
				{ role: "assistant", content: "msg4", ts: 1300 },
			]

			const removed = findRemovedMessages(original, condensed)

			expect(removed).toHaveLength(2)
			expect(removed[0]).toEqual({ role: "assistant", content: "msg2", ts: 1100 })
			expect(removed[1]).toEqual({ role: "user", content: "msg3", ts: 1200 })
		})

		it("should handle messages without timestamps", () => {
			const original: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "no timestamp" }, // No ts field
				{ role: "user", content: "msg3", ts: 1200 },
			]

			const condensed: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "user", content: "msg3", ts: 1200 },
			]

			const removed = findRemovedMessages(original, condensed)

			expect(removed).toHaveLength(0) // Message without timestamp is not included
		})
	})

	describe("restoreMessagesForTimestamp", () => {
		it("should return null if target timestamp already exists", async () => {
			const currentMessages: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "msg2", ts: 1100 },
			]

			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 1100)
			expect(result).toBeNull()
		})

		it("should return null if no journal exists", async () => {
			const currentMessages: ApiMessage[] = [{ role: "user", content: "msg1", ts: 1000 }]

			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 2000)
			expect(result).toBeNull()
		})

		it("should restore messages from single journal entry", async () => {
			const currentMessages: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "summary", ts: 1500, isSummary: true },
				{ role: "user", content: "msg5", ts: 1600 },
			]

			const journal: CondenseJournal = {
				version: 1,
				entries: [
					{
						removed: [
							{ role: "assistant", content: "msg2", ts: 1100 },
							{ role: "user", content: "msg3", ts: 1200 },
							{ role: "assistant", content: "msg4", ts: 1300 },
						],
						boundary: { firstKeptTs: 1000, lastKeptTs: 1600, summaryTs: 1500 },
						createdAt: Date.now(),
						type: "manual",
					},
				],
			}

			await writeJournal(testDir, journal)

			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 1200)

			expect(result).not.toBeNull()
			expect(result).toHaveLength(6) // 3 current + 3 restored
			expect(result?.find((m) => m.ts === 1200)).toBeDefined()
			expect(result?.find((m) => m.ts === 1100)).toBeDefined()
			expect(result?.find((m) => m.ts === 1300)).toBeDefined()
			// Should be sorted by timestamp
			expect(result?.[0].ts).toBe(1000)
			expect(result?.[1].ts).toBe(1100)
			expect(result?.[2].ts).toBe(1200)
			expect(result?.[3].ts).toBe(1300)
			expect(result?.[4].ts).toBe(1500)
			expect(result?.[5].ts).toBe(1600)
		})

		it("should handle nested condenses correctly", async () => {
			const currentMessages: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "summary2", ts: 2500, isSummary: true },
				{ role: "user", content: "msg9", ts: 2600 },
			]

			const journal: CondenseJournal = {
				version: 1,
				entries: [
					// First condense
					{
						removed: [
							{ role: "assistant", content: "msg2", ts: 1100 },
							{ role: "user", content: "msg3", ts: 1200 },
						],
						boundary: { firstKeptTs: 1000, summaryTs: 1500 },
						createdAt: Date.now() - 10000,
						type: "manual",
					},
					// Second condense (nested) - this wouldn't contain msg2 and msg3 again since they were already condensed
					{
						removed: [
							{ role: "assistant", content: "summary1", ts: 1500, isSummary: true },
							{ role: "user", content: "msg5", ts: 1600 },
							{ role: "assistant", content: "msg6", ts: 1700 },
						],
						boundary: { firstKeptTs: 1000, summaryTs: 2500 },
						createdAt: Date.now(),
						type: "manual",
					},
				],
			}

			await writeJournal(testDir, journal)

			// Try to restore a message from the first condensed range
			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 1100)

			expect(result).not.toBeNull()
			// Should restore messages that contain the target timestamp
			expect(result?.find((m) => m.ts === 1100)).toBeDefined()
			expect(result?.find((m) => m.ts === 1200)).toBeDefined()
			// The restoration logic only restores messages needed to reach the target timestamp
			// It doesn't necessarily restore all messages from all entries
		})

		it("should not restore messages that are already in current messages", async () => {
			const currentMessages: ApiMessage[] = [
				{ role: "user", content: "msg1", ts: 1000 },
				{ role: "assistant", content: "msg2", ts: 1100 }, // Already present
				{ role: "assistant", content: "summary", ts: 1500, isSummary: true },
			]

			const journal: CondenseJournal = {
				version: 1,
				entries: [
					{
						removed: [
							{ role: "assistant", content: "msg2", ts: 1100 }, // Duplicate
							{ role: "user", content: "msg3", ts: 1200 },
						],
						boundary: {},
						createdAt: Date.now(),
						type: "manual",
					},
				],
			}

			await writeJournal(testDir, journal)

			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 1200)

			expect(result).not.toBeNull()
			expect(result).toHaveLength(4) // 3 current + 1 restored (msg3)
			// Should only have one msg2
			expect(result?.filter((m) => m.ts === 1100)).toHaveLength(1)
		})

		it("should return null if target timestamp not found in journal", async () => {
			const currentMessages: ApiMessage[] = [{ role: "user", content: "msg1", ts: 1000 }]

			const journal: CondenseJournal = {
				version: 1,
				entries: [
					{
						removed: [{ role: "assistant", content: "msg2", ts: 1100 }],
						boundary: {},
						createdAt: Date.now(),
						type: "manual",
					},
				],
			}

			await writeJournal(testDir, journal)

			// Try to restore a timestamp that doesn't exist in journal
			const result = await restoreMessagesForTimestamp(testDir, currentMessages, 9999)
			expect(result).toBeNull()
		})
	})
})
