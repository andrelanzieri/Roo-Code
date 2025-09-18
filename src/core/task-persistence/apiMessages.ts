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

	// Safety check: prevent saving an empty array if a non-empty conversation previously existed
	if (Array.isArray(messages) && messages.length === 0) {
		// Check if there's an existing non-empty conversation history
		if (await fileExistsAtPath(filePath)) {
			try {
				const existingContent = await fs.readFile(filePath, "utf8")
				const existingData = JSON.parse(existingContent)
				if (Array.isArray(existingData) && existingData.length > 0) {
					console.error(
						`[Roo-Debug] saveApiMessages: Attempted to save empty array over existing non-empty conversation. ` +
							`TaskId: ${taskId}, Existing messages count: ${existingData.length}. ` +
							`Skipping save to prevent data loss.`,
					)
					return // Don't save empty array over non-empty conversation
				}
			} catch (error) {
				// If we can't read/parse the existing file, proceed with save
				console.error(
					`[Roo-Debug] saveApiMessages: Error checking existing conversation history. ` +
						`TaskId: ${taskId}, Error: ${error}. Proceeding with save.`,
				)
			}
		}
	}

	await safeWriteJson(filePath, messages)
}
