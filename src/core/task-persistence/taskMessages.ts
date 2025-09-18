import { safeWriteJson } from "../../utils/safeWriteJson"
import * as path from "path"
import * as fs from "fs/promises"

import type { ClineMessage } from "@roo-code/types"

import { fileExistsAtPath } from "../../utils/fs"

import { GlobalFileNames } from "../../shared/globalFileNames"
import { getTaskDirectoryPath } from "../../utils/storage"

export type ReadTaskMessagesOptions = {
	taskId: string
	globalStoragePath: string
}

export async function readTaskMessages({
	taskId,
	globalStoragePath,
}: ReadTaskMessagesOptions): Promise<ClineMessage[]> {
	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
	const fileExists = await fileExistsAtPath(filePath)

	if (fileExists) {
		return JSON.parse(await fs.readFile(filePath, "utf8"))
	}

	return []
}

export type SaveTaskMessagesOptions = {
	messages: ClineMessage[]
	taskId: string
	globalStoragePath: string
}

export async function saveTaskMessages({ messages, taskId, globalStoragePath }: SaveTaskMessagesOptions) {
	// Validate messages array to prevent saving empty arrays that could corrupt history
	if (!messages || !Array.isArray(messages)) {
		console.error(
			`[Roo-Debug] saveTaskMessages: Invalid messages provided for taskId: ${taskId}. Messages must be an array.`,
		)
		throw new Error("Invalid messages: must be an array")
	}

	// Warn if saving empty array but allow it for new tasks
	if (messages.length === 0) {
		console.warn(
			`[Roo-Debug] saveTaskMessages: Saving empty messages array for taskId: ${taskId}. This may be intentional for new tasks.`,
		)
	}

	const taskDir = await getTaskDirectoryPath(globalStoragePath, taskId)
	const filePath = path.join(taskDir, GlobalFileNames.uiMessages)
	await safeWriteJson(filePath, messages)
}
