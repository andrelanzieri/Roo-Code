import { safeWriteJson } from "../../utils/safeWriteJson"
import * as path from "path"
import * as fs from "fs/promises"

import { Anthropic } from "@anthropic-ai/sdk"

import { fileExistsAtPath } from "../../utils/fs"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { getTaskDirectoryPath } from "../../utils/storage"

export type ApiMessage = Anthropic.MessageParam & { ts?: number; isSummary?: boolean }

export async function readApiMessages({
	taskId,
	globalStoragePath,
}: {
	taskId: string
	globalStoragePath: string
}): Promise<ApiMessage[]> {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.apiConversationHistory)

	if (await fileExistsAtPath(filePath)) {
		const fileContent = await fs.readFile(filePath, "utf8")
		try {
			const parsedData = JSON.parse(fileContent)
			if (Array.isArray(parsedData) && parsedData.length === 0) {
				console.error(
					`[Roo-Debug] readApiMessages: Found API conversation history file, but it's empty (parsed as []). TaskId: ${taskId}, Path: ${filePath}`,
				)
			}
			return parsedData
		} catch (error) {
			console.error(
				`[Roo-Debug] readApiMessages: Error parsing API conversation history file. TaskId: ${taskId}, Path: ${filePath}, Error: ${error}`,
			)
			throw error
		}
	} else {
		const oldPath = path.join(taskDir, "claude_messages.json")

		if (await fileExistsAtPath(oldPath)) {
			const fileContent = await fs.readFile(oldPath, "utf8")
			try {
				const parsedData = JSON.parse(fileContent)
				if (Array.isArray(parsedData) && parsedData.length === 0) {
					console.error(
						`[Roo-Debug] readApiMessages: Found OLD API conversation history file (claude_messages.json), but it's empty (parsed as []). TaskId: ${taskId}, Path: ${oldPath}`,
					)
				}
				await fs.unlink(oldPath)
				return parsedData
			} catch (error) {
				console.error(
					`[Roo-Debug] readApiMessages: Error parsing OLD API conversation history file (claude_messages.json). TaskId: ${taskId}, Path: ${oldPath}, Error: ${error}`,
				)
				// DO NOT unlink oldPath if parsing failed, throw error instead.
				throw error
			}
		}
	}

	// If we reach here, neither the new nor the old history file was found.
	console.error(
		`[Roo-Debug] readApiMessages: API conversation history file not found for taskId: ${taskId}. Expected at: ${filePath}`,
	)
	return []
}

export async function saveApiMessages({
	messages,
	taskId,
	globalStoragePath,
}: {
	messages: ApiMessage[]
	taskId: string
	globalStoragePath: string
}) {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.apiConversationHistory)
	await safeWriteJson(filePath, messages)
}

/**
 * Transaction helper for safe read-modify-write operations on API messages.
 * Ensures atomic updates by reading, modifying, and writing under a conceptual lock.
 *
 * @param taskId - The task ID
 * @param globalStoragePath - The global storage path
 * @param updater - A pure function that takes the current messages and returns the updated messages
 * @param options - Optional configuration
 * @returns The updated messages
 */
export async function transactApiMessages({
	taskId,
	globalStoragePath,
	updater,
	options = {},
}: {
	taskId: string
	globalStoragePath: string
	updater: (messages: ApiMessage[]) => ApiMessage[]
	options?: {
		allowEmpty?: boolean
	}
}): Promise<ApiMessage[]> {
	// Read current state
	const currentMessages = await readApiMessages({ taskId, globalStoragePath })

	// Apply the pure updater function
	const updatedMessages = updater(currentMessages)

	// Guard against unintentional empty writes
	if (updatedMessages.length === 0 && currentMessages.length > 0 && !options.allowEmpty) {
		console.warn(
			`[transactApiMessages] Preventing empty write for taskId: ${taskId}. Current has ${currentMessages.length} messages. Use allowEmpty: true to force.`,
		)
		return currentMessages // Return unchanged
	}

	// Commit the changes
	await saveApiMessages({ messages: updatedMessages, taskId, globalStoragePath })

	return updatedMessages
}
