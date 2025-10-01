import * as fs from "fs/promises"
import * as path from "path"
import { type ApiMessage } from "../task-persistence"

/**
 * Represents a single entry in the condense journal
 */
export interface CondenseJournalEntry {
	/** Messages that were removed during this condense operation */
	removed: ApiMessage[]
	/** Boundary timestamps for the condense operation */
	boundary: {
		/** Timestamp of the first message kept after condensing */
		firstKeptTs?: number
		/** Timestamp of the last message kept before summary */
		lastKeptTs?: number
		/** Timestamp of the summary message created */
		summaryTs?: number
	}
	/** When this journal entry was created */
	createdAt: number
	/** Type of condense operation */
	type: "manual" | "auto"
}

/**
 * The complete journal containing all condense entries
 */
export interface CondenseJournal {
	version: number
	entries: CondenseJournalEntry[]
}

const JOURNAL_FILENAME = "condense_journal.json"
const JOURNAL_VERSION = 1

/**
 * Get the path to the condense journal file for a task
 */
export function getJournalPath(taskDirPath: string): string {
	return path.join(taskDirPath, JOURNAL_FILENAME)
}

/**
 * Read the condense journal from disk
 */
export async function readJournal(taskDirPath: string): Promise<CondenseJournal | null> {
	const journalPath = getJournalPath(taskDirPath)
	try {
		const content = await fs.readFile(journalPath, "utf-8")
		const journal = JSON.parse(content) as CondenseJournal

		// Validate version
		if (journal.version !== JOURNAL_VERSION) {
			console.warn(`Condense journal version mismatch: expected ${JOURNAL_VERSION}, got ${journal.version}`)
		}

		return journal
	} catch (error) {
		// Journal doesn't exist yet, which is fine
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null
		}
		console.error("Error reading condense journal:", error)
		return null
	}
}

/**
 * Write the condense journal to disk
 */
export async function writeJournal(taskDirPath: string, journal: CondenseJournal): Promise<void> {
	const journalPath = getJournalPath(taskDirPath)
	const { safeWriteJson } = await import("../../utils/safeWriteJson")
	await safeWriteJson(journalPath, journal)
}

/**
 * Append a new entry to the condense journal
 */
export async function appendJournalEntry(taskDirPath: string, entry: CondenseJournalEntry): Promise<void> {
	// Read existing journal or create new one
	let journal = await readJournal(taskDirPath)
	if (!journal) {
		journal = {
			version: JOURNAL_VERSION,
			entries: [],
		}
	}

	// Append the new entry
	journal.entries.push(entry)

	// Write back to disk
	await writeJournal(taskDirPath, journal)
}

/**
 * Create a journal entry from the condense operation
 */
export function createJournalEntry(
	removedMessages: ApiMessage[],
	firstKeptMessage: ApiMessage | undefined,
	lastKeptMessage: ApiMessage | undefined,
	summaryMessage: ApiMessage | undefined,
	type: "manual" | "auto" = "manual",
): CondenseJournalEntry {
	return {
		removed: removedMessages,
		boundary: {
			firstKeptTs: firstKeptMessage?.ts,
			lastKeptTs: lastKeptMessage?.ts,
			summaryTs: summaryMessage?.ts,
		},
		createdAt: Date.now(),
		type,
	}
}

/**
 * Restore messages from the journal to make a target timestamp available
 * @param taskDirPath Path to the task directory
 * @param currentMessages Current API messages in memory
 * @param targetTs Target timestamp we need to make available
 * @returns Updated messages array with restored messages, or null if restoration wasn't needed
 */
export async function restoreMessagesForTimestamp(
	taskDirPath: string,
	currentMessages: ApiMessage[],
	targetTs: number,
): Promise<ApiMessage[] | null> {
	// Check if target timestamp already exists in current messages
	const targetExists = currentMessages.some((msg) => msg.ts === targetTs)
	if (targetExists) {
		return null // No restoration needed
	}

	// Read the journal
	const journal = await readJournal(taskDirPath)
	if (!journal || journal.entries.length === 0) {
		return null // No journal or no entries to restore from
	}

	// Create a map of current message timestamps for quick lookup
	const currentTsSet = new Set(currentMessages.map((msg) => msg.ts).filter((ts) => ts !== undefined))

	// Collect messages to restore
	const messagesToRestore: ApiMessage[] = []

	// Walk journal entries from newest to oldest
	for (let i = journal.entries.length - 1; i >= 0; i--) {
		const entry = journal.entries[i]

		// Check if this entry contains our target timestamp
		const hasTarget = entry.removed.some((msg) => msg.ts === targetTs)
		if (!hasTarget) {
			continue
		}

		// Add all removed messages from this entry that aren't already in current messages
		for (const msg of entry.removed) {
			if (msg.ts && !currentTsSet.has(msg.ts)) {
				messagesToRestore.push(msg)
				currentTsSet.add(msg.ts)
			}
		}

		// Check if we now have the target
		if (messagesToRestore.some((msg) => msg.ts === targetTs)) {
			break
		}
	}

	// If we didn't find the target, return null
	if (!messagesToRestore.some((msg) => msg.ts === targetTs)) {
		return null
	}

	// Merge restored messages with current messages and sort by timestamp
	const mergedMessages = [...currentMessages, ...messagesToRestore]
	mergedMessages.sort((a, b) => {
		const tsA = a.ts ?? 0
		const tsB = b.ts ?? 0
		return tsA - tsB
	})

	return mergedMessages
}

/**
 * Find messages that will be removed during a condense operation
 * @param originalMessages Original messages before condensing
 * @param condensedMessages Messages after condensing
 * @returns Array of removed messages
 */
export function findRemovedMessages(originalMessages: ApiMessage[], condensedMessages: ApiMessage[]): ApiMessage[] {
	// Create a set of timestamps from condensed messages for efficient lookup
	const condensedTsSet = new Set(condensedMessages.map((msg) => msg.ts).filter((ts) => ts !== undefined))

	// Find messages that exist in original but not in condensed
	return originalMessages.filter((msg) => {
		// Keep messages without timestamps (shouldn't happen but be safe)
		if (!msg.ts) {
			return false
		}
		// Message is removed if its timestamp is not in the condensed set
		return !condensedTsSet.has(msg.ts)
	})
}
