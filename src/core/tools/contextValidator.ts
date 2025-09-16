import { ModelInfo } from "@roo-code/types"
import { getModelMaxOutputTokens } from "../../shared/api"
import { countFileLines } from "../../integrations/misc/line-counter"
import { readLines } from "../../integrations/misc/read-lines"
import { isBinaryFile } from "isbinaryfile"
import * as path from "path"
import { getSupportedBinaryFormats } from "../../integrations/misc/extract-text"

/**
 * Configuration for file reading behavior when context limits are reached
 */
export interface FileReadingConfig {
	/** How to handle files that exceed context limits */
	largeFileHandling: "truncate" | "chunk" | "fail"
	/** Safety buffer percentage (0-100) to reserve from context window */
	safetyBufferPercent: number
	/** Maximum number of lines to read in a single chunk */
	maxChunkLines: number
	/** Whether to show definitions when truncating */
	showDefinitionsOnTruncate: boolean
}

/**
 * Result of context validation for a file
 */
export interface ContextValidationResult {
	/** Whether the file can be read within context limits */
	canRead: boolean
	/** Maximum number of lines that can be safely read */
	maxSafeLines: number
	/** Total lines in the file */
	totalLines: number
	/** Estimated tokens for the file content */
	estimatedTokens: number
	/** Available tokens in the context window */
	availableTokens: number
	/** Suggested action for handling the file */
	suggestedAction: "read_full" | "read_partial" | "read_chunks" | "skip"
	/** User-friendly message explaining the situation */
	message?: string
	/** Whether the file is binary */
	isBinary: boolean
	/** Whether the file is a supported binary format */
	isSupportedBinary: boolean
}

/**
 * Options for validating context
 */
export interface ContextValidationOptions {
	/** Current model information */
	model: ModelInfo
	/** Current API configuration */
	apiConfiguration?: any
	/** Current token usage in the conversation */
	currentTokenUsage?: number
	/** File reading configuration */
	config?: Partial<FileReadingConfig>
	/** Whether partial reads are enabled */
	partialReadsEnabled?: boolean
}

/**
 * Default configuration for file reading
 */
const DEFAULT_CONFIG: FileReadingConfig = {
	largeFileHandling: "truncate",
	safetyBufferPercent: 25,
	maxChunkLines: 1000,
	showDefinitionsOnTruncate: true,
}

/**
 * Estimates the number of tokens in a text string
 * Uses a simple heuristic: ~1 token per 4 characters (conservative estimate)
 */
export function estimateTokens(text: string): number {
	// Conservative estimate: 1 token per 3 characters for code
	// This accounts for code having more symbols and shorter "words"
	return Math.ceil(text.length / 3)
}

/**
 * Estimates tokens for a given number of lines in a file
 * Assumes average line length of 80 characters for code files
 */
export function estimateTokensForLines(lineCount: number): number {
	const avgCharsPerLine = 80
	const estimatedChars = lineCount * avgCharsPerLine
	return estimateTokens(estimatedChars.toString())
}

/**
 * Calculates available tokens in the context window
 */
export function calculateAvailableTokens(
	model: ModelInfo,
	apiConfiguration: any,
	currentTokenUsage: number = 0,
	safetyBufferPercent: number = 25,
): number {
	const contextWindow = model.contextWindow || 128000 // Default to 128k if not specified

	// Get max output tokens
	const maxOutputTokens =
		getModelMaxOutputTokens({
			modelId: apiConfiguration?.modelId || "unknown",
			model,
			settings: apiConfiguration,
		}) || 8192 // Default to 8k if not specified

	// Calculate total available tokens (context window - output tokens - current usage)
	const totalAvailable = contextWindow - maxOutputTokens - currentTokenUsage

	// Apply safety buffer
	const safetyBuffer = Math.floor(totalAvailable * (safetyBufferPercent / 100))
	const availableWithBuffer = totalAvailable - safetyBuffer

	return Math.max(0, availableWithBuffer)
}

/**
 * Validates whether a file can be read within context limits
 */
export async function validateFileContext(
	filePath: string,
	options: ContextValidationOptions,
): Promise<ContextValidationResult> {
	const config = { ...DEFAULT_CONFIG, ...options.config }
	const { model, apiConfiguration, currentTokenUsage = 0, partialReadsEnabled = true } = options

	// Check if file is binary
	const isBinary = await isBinaryFile(filePath).catch(() => false)
	const fileExtension = path.extname(filePath).toLowerCase()
	const supportedBinaryFormats = getSupportedBinaryFormats()
	const isSupportedBinary = supportedBinaryFormats.includes(fileExtension)

	// For binary files that aren't supported, we can't read them
	if (isBinary && !isSupportedBinary) {
		return {
			canRead: false,
			maxSafeLines: 0,
			totalLines: 0,
			estimatedTokens: 0,
			availableTokens: 0,
			suggestedAction: "skip",
			message: `Binary file format ${fileExtension || "unknown"} is not supported for text extraction`,
			isBinary: true,
			isSupportedBinary: false,
		}
	}

	// Count total lines in the file
	const totalLines = await countFileLines(filePath)

	// Calculate available tokens
	const availableTokens = calculateAvailableTokens(
		model,
		apiConfiguration,
		currentTokenUsage,
		config.safetyBufferPercent,
	)

	// For very small files, always allow reading
	if (totalLines <= 100) {
		return {
			canRead: true,
			maxSafeLines: totalLines,
			totalLines,
			estimatedTokens: estimateTokensForLines(totalLines),
			availableTokens,
			suggestedAction: "read_full",
			isBinary,
			isSupportedBinary,
		}
	}

	// Estimate tokens for the entire file
	// For more accurate estimation, we could read a sample of lines
	const estimatedTokens = estimateTokensForLines(totalLines)

	// Check if the entire file fits within available context
	if (estimatedTokens <= availableTokens) {
		return {
			canRead: true,
			maxSafeLines: totalLines,
			totalLines,
			estimatedTokens,
			availableTokens,
			suggestedAction: "read_full",
			isBinary,
			isSupportedBinary,
		}
	}

	// File doesn't fit entirely - determine best approach
	const maxSafeLines = Math.floor((availableTokens / estimatedTokens) * totalLines)

	// If partial reads are disabled, we can't read the file
	if (!partialReadsEnabled) {
		return {
			canRead: false,
			maxSafeLines: 0,
			totalLines,
			estimatedTokens,
			availableTokens,
			suggestedAction: "skip",
			message: `File is too large (${totalLines} lines, ~${estimatedTokens} tokens) to fit in available context (${availableTokens} tokens). Enable partial reads to read portions of this file.`,
			isBinary,
			isSupportedBinary,
		}
	}

	// Determine suggested action based on configuration
	let suggestedAction: ContextValidationResult["suggestedAction"]
	let message: string | undefined

	if (config.largeFileHandling === "truncate") {
		suggestedAction = "read_partial"
		message = `File truncated to ${maxSafeLines} of ${totalLines} lines to fit within context limits. ${
			config.showDefinitionsOnTruncate
				? "Showing code definitions for overview."
				: "Use line_range to read specific sections."
		}`
	} else if (config.largeFileHandling === "chunk") {
		suggestedAction = "read_chunks"
		const numChunks = Math.ceil(totalLines / config.maxChunkLines)
		message = `File will be read in ${numChunks} chunks of up to ${config.maxChunkLines} lines each.`
	} else {
		suggestedAction = "skip"
		message = `File is too large (${totalLines} lines) to read. Use line_range to read specific sections.`
	}

	return {
		canRead: config.largeFileHandling !== "fail",
		maxSafeLines,
		totalLines,
		estimatedTokens,
		availableTokens,
		suggestedAction,
		message,
		isBinary,
		isSupportedBinary,
	}
}

/**
 * Reads a file in chunks that fit within context limits
 */
export async function* readFileInChunks(
	filePath: string,
	maxLinesPerChunk: number,
	totalLines?: number,
): AsyncGenerator<{ content: string; startLine: number; endLine: number; isLastChunk: boolean }> {
	const lines = totalLines || (await countFileLines(filePath))

	for (let startLine = 0; startLine < lines; startLine += maxLinesPerChunk) {
		const endLine = Math.min(startLine + maxLinesPerChunk - 1, lines - 1)
		const content = await readLines(filePath, endLine, startLine)

		yield {
			content,
			startLine: startLine + 1, // Convert to 1-based for display
			endLine: endLine + 1,
			isLastChunk: endLine === lines - 1,
		}
	}
}

/**
 * Validates multiple files and determines the best reading strategy
 */
export async function validateMultipleFiles(
	filePaths: string[],
	options: ContextValidationOptions,
): Promise<Map<string, ContextValidationResult>> {
	const results = new Map<string, ContextValidationResult>()
	let cumulativeTokenUsage = options.currentTokenUsage || 0

	for (const filePath of filePaths) {
		// Validate each file with cumulative token usage
		const result = await validateFileContext(filePath, {
			...options,
			currentTokenUsage: cumulativeTokenUsage,
		})

		results.set(filePath, result)

		// Update cumulative usage if file will be read
		if (result.canRead && result.suggestedAction === "read_full") {
			cumulativeTokenUsage += result.estimatedTokens
		} else if (result.canRead && result.suggestedAction === "read_partial") {
			cumulativeTokenUsage += estimateTokensForLines(result.maxSafeLines)
		}
	}

	return results
}

/**
 * Generates a user-friendly message for files that can't be fully read
 */
export function generateFileReadingMessage(
	results: Map<string, ContextValidationResult>,
	config: FileReadingConfig,
): string {
	const messages: string[] = []
	const truncatedFiles: string[] = []
	const skippedFiles: string[] = []
	const chunkedFiles: string[] = []

	for (const [filePath, result] of results) {
		const fileName = path.basename(filePath)

		if (!result.canRead) {
			skippedFiles.push(fileName)
		} else if (result.suggestedAction === "read_partial") {
			truncatedFiles.push(`${fileName} (${result.maxSafeLines}/${result.totalLines} lines)`)
		} else if (result.suggestedAction === "read_chunks") {
			chunkedFiles.push(fileName)
		}
	}

	if (truncatedFiles.length > 0) {
		messages.push(`Truncated files to fit context: ${truncatedFiles.join(", ")}`)
	}

	if (chunkedFiles.length > 0) {
		messages.push(`Files to be read in chunks: ${chunkedFiles.join(", ")}`)
	}

	if (skippedFiles.length > 0) {
		messages.push(
			`Skipped files (too large): ${skippedFiles.join(", ")}. Use line_range to read specific sections.`,
		)
	}

	return messages.join("\n")
}
