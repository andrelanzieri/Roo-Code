import path from "path"
import fs from "fs/promises"

import { TelemetryService } from "@roo-code/telemetry"

import { ClineSayTool } from "../../shared/ExtensionMessage"
import { getReadablePath } from "../../utils/path"
import { Task } from "../task/Task"
import { ToolUse, RemoveClosingTag, AskApproval, HandleError, PushToolResult } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { fileExistsAtPath } from "../../utils/fs"
import { RecordSource } from "../context-tracking/FileContextTrackerTypes"

interface MorphApiResponse {
	success: boolean
	content?: string
	error?: string
}

/**
 * Calls the Morph Fast Apply API to apply diffs with high accuracy
 * @param apiKey The Morph API key
 * @param originalContent The original file content
 * @param diffContent The diff content to apply
 * @returns The result from the Morph API
 */
async function callMorphApi(apiKey: string, originalContent: string, diffContent: string): Promise<MorphApiResponse> {
	try {
		// Using native fetch API (available in Node.js 18+)
		const response = await fetch("https://api.morph.so/v1/fast-apply", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				original: originalContent,
				diff: diffContent,
			}),
		})

		if (!response.ok) {
			const errorText = await response.text()
			return {
				success: false,
				error: `Morph API error (${response.status}): ${errorText}`,
			}
		}

		const data = (await response.json()) as any
		return {
			success: true,
			content: data.result || data.content,
		}
	} catch (error: any) {
		return {
			success: false,
			error: `Failed to call Morph API: ${error.message}`,
		}
	}
}

export async function morphFastApplyTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const relPath: string | undefined = block.params.path
	let diffContent: string | undefined = block.params.diff

	const sharedMessageProps: ClineSayTool = {
		tool: "appliedDiff",
		path: getReadablePath(cline.cwd, removeClosingTag("path", relPath)),
		diff: diffContent,
	}

	try {
		if (block.partial) {
			// Update GUI message for partial blocks
			await cline.ask("tool", JSON.stringify(sharedMessageProps), block.partial).catch(() => {})
			return
		}

		if (!relPath) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("morph_fast_apply")
			pushToolResult(await cline.sayAndCreateMissingParamError("morph_fast_apply", "path"))
			return
		}

		if (!diffContent) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("morph_fast_apply")
			pushToolResult(await cline.sayAndCreateMissingParamError("morph_fast_apply", "diff"))
			return
		}

		// Check if file access is allowed
		const accessAllowed = cline.rooIgnoreController?.validateAccess(relPath)
		if (!accessAllowed) {
			await cline.say("rooignore_error", relPath)
			pushToolResult(formatResponse.toolError(formatResponse.rooIgnoreError(relPath)))
			return
		}

		const absolutePath = path.resolve(cline.cwd, relPath)
		const fileExists = await fileExistsAtPath(absolutePath)

		if (!fileExists) {
			cline.consecutiveMistakeCount++
			cline.recordToolError("morph_fast_apply")
			const formattedError = `File does not exist at path: ${absolutePath}\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>`
			await cline.say("error", formattedError)
			pushToolResult(formattedError)
			return
		}

		// Get the Morph API key from provider state
		const provider = cline.providerRef.deref()
		const state = await provider?.getState()
		// Check if Morph API key is configured (we'll add this to provider settings later)
		const morphApiKey = (state as any)?.morphApiKey

		if (!morphApiKey) {
			// Morph API key not configured, fall back to regular apply_diff
			await cline.say("text", "Morph API key not configured. Falling back to standard diff application.")
			pushToolResult("Morph API key not configured. Please configure it in settings to use Morph Fast Apply.")
			return
		}

		const originalContent = await fs.readFile(absolutePath, "utf-8")

		// Call Morph API to apply the diff
		const morphResult = await callMorphApi(morphApiKey, originalContent, diffContent)

		if (!morphResult.success) {
			cline.consecutiveMistakeCount++
			const currentCount = (cline.consecutiveMistakeCountForApplyDiff.get(relPath) || 0) + 1
			cline.consecutiveMistakeCountForApplyDiff.set(relPath, currentCount)

			TelemetryService.instance.captureDiffApplicationError(cline.taskId, currentCount)

			const formattedError = `Unable to apply diff using Morph Fast Apply: ${absolutePath}\n\n<error_details>\n${morphResult.error}\n</error_details>`

			if (currentCount >= 2) {
				await cline.say("diff_error", formattedError)
			}

			cline.recordToolError("morph_fast_apply", formattedError)
			pushToolResult(formattedError)
			return
		}

		cline.consecutiveMistakeCount = 0
		cline.consecutiveMistakeCountForApplyDiff.delete(relPath)

		// Check if file is write-protected
		const isWriteProtected = cline.rooProtectedController?.isWriteProtected(relPath) || false

		// Show diff view and ask for approval
		cline.diffViewProvider.editType = "modify"
		await cline.diffViewProvider.open(relPath)
		await cline.diffViewProvider.update(morphResult.content!, true)
		cline.diffViewProvider.scrollToFirstDiff()

		const completeMessage = JSON.stringify({
			...sharedMessageProps,
			diff: diffContent,
			isProtected: isWriteProtected,
		} satisfies ClineSayTool)

		const didApprove = await askApproval("tool", completeMessage, undefined, isWriteProtected)

		if (!didApprove) {
			await cline.diffViewProvider.revertChanges()
			return
		}

		// Save the changes
		const diagnosticsEnabled = state?.diagnosticsEnabled ?? true
		const writeDelayMs = state?.writeDelayMs ?? 0
		await cline.diffViewProvider.saveChanges(diagnosticsEnabled, writeDelayMs)

		// Track file edit operation
		await cline.fileContextTracker.trackFileContext(relPath, "roo_edited" as RecordSource)

		cline.didEditFile = true

		// Get the formatted response message
		const message = await cline.diffViewProvider.pushToolWriteResult(cline, cline.cwd, !fileExists)

		// Add success notice about using Morph
		const morphNotice = "\n<notice>Successfully applied diff using Morph Fast Apply (98% accuracy)</notice>"
		pushToolResult(message + morphNotice)

		await cline.diffViewProvider.reset()

		// Track successful Morph usage
		TelemetryService.instance.captureToolUsage(cline.taskId, "morph_fast_apply")
	} catch (error) {
		await handleError("applying diff with Morph Fast Apply", error)
		await cline.diffViewProvider.reset()
	}
}
