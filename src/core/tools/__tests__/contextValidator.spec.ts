import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fs from "fs/promises"
import {
	validateFileContext,
	validateMultipleFiles,
	calculateAvailableTokens,
	readFileInChunks,
	FileReadingConfig,
} from "../contextValidator"
import type { ModelInfo } from "@roo-code/types"

// Define types that are internal to contextValidator
interface ValidationOptions {
	model: ModelInfo
	apiConfiguration: any
	currentTokenUsage: number
	config: FileReadingConfig
	partialReadsEnabled: boolean
}

// Mock fs module
vi.mock("fs/promises")

describe("contextValidator", () => {
	const mockModelInfo: ModelInfo = {
		contextWindow: 10000,
		maxTokens: 4000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0,
		outputPrice: 0,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0,
		description: "Test model",
	}

	const defaultConfig: FileReadingConfig = {
		largeFileHandling: "truncate",
		safetyBufferPercent: 25,
		maxChunkLines: 1000,
		showDefinitionsOnTruncate: true,
	}

	const defaultOptions: ValidationOptions = {
		model: mockModelInfo,
		apiConfiguration: {},
		currentTokenUsage: 0,
		config: defaultConfig,
		partialReadsEnabled: true,
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("calculateAvailableTokens", () => {
		it("should calculate available tokens with safety buffer", () => {
			const result = calculateAvailableTokens(mockModelInfo, {}, 2000, 25)
			// Context window: 10000
			// Max output: 4000
			// Usable: 10000 - 4000 = 6000
			// Current usage: 2000
			// Available before buffer: 6000 - 2000 = 4000
			// With 25% buffer: 4000 * 0.75 = 3000
			expect(result).toBe(3000)
		})

		it("should handle models without maxTokens", () => {
			const modelWithoutMax = { ...mockModelInfo, maxTokens: undefined }
			const result = calculateAvailableTokens(modelWithoutMax, {}, 2000, 25)
			// Context window: 10000
			// No max output, use 20% of context: 2000
			// Usable: 10000 - 2000 = 8000
			// Current usage: 2000
			// Available before buffer: 8000 - 2000 = 6000
			// With 25% buffer: 6000 * 0.75 = 4500
			expect(result).toBe(4500)
		})

		it("should return 0 when context is exhausted", () => {
			const result = calculateAvailableTokens(mockModelInfo, {}, 8000, 25)
			expect(result).toBe(0)
		})

		it("should handle API configuration overrides", () => {
			const apiConfig = { maxTokens: 2000 }
			const result = calculateAvailableTokens(mockModelInfo, apiConfig, 1000, 25)
			// API override: 2000
			// Current usage: 1000
			// Available before buffer: 2000 - 1000 = 1000
			// With 25% buffer: 1000 * 0.75 = 750
			expect(result).toBe(750)
		})
	})

	describe("validateFileContext", () => {
		it("should validate small file successfully", async () => {
			const fileContent = "Line 1\nLine 2\nLine 3"
			vi.mocked(fs.stat).mockResolvedValue({ size: fileContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(fileContent)

			const result = await validateFileContext("/test/file.txt", defaultOptions)

			expect(result.canRead).toBe(true)
			expect(result.estimatedTokens).toBeGreaterThan(0)
			expect(result.suggestedAction).toBe("read_full")
		})

		it("should suggest partial read for large files when truncate is enabled", async () => {
			const largeContent = Array(10000).fill("This is a long line of text").join("\n")
			vi.mocked(fs.stat).mockResolvedValue({ size: largeContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(largeContent)

			const result = await validateFileContext("/test/large.txt", defaultOptions)

			expect(result.canRead).toBe(true)
			expect(result.suggestedAction).toBe("read_partial")
			expect(result.maxSafeLines).toBeLessThan(10000)
			expect(result.message).toContain("truncated")
		})

		it('should fail for large files when largeFileHandling is "fail"', async () => {
			const largeContent = Array(10000).fill("This is a long line of text").join("\n")
			vi.mocked(fs.stat).mockResolvedValue({ size: largeContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(largeContent)

			const failOptions = {
				...defaultOptions,
				config: { ...defaultConfig, largeFileHandling: "fail" as const },
			}

			const result = await validateFileContext("/test/large.txt", failOptions)

			expect(result.canRead).toBe(false)
			expect(result.message).toContain("exceeds available context")
		})

		it("should suggest chunked reading when enabled", async () => {
			const largeContent = Array(10000).fill("This is a long line of text").join("\n")
			vi.mocked(fs.stat).mockResolvedValue({ size: largeContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(largeContent)

			const chunkOptions = {
				...defaultOptions,
				config: { ...defaultConfig, largeFileHandling: "chunk" as const },
			}

			const result = await validateFileContext("/test/large.txt", chunkOptions)

			expect(result.canRead).toBe(true)
			expect(result.suggestedAction).toBe("read_chunks")
			expect(result.message).toContain("chunks")
		})

		it("should handle binary files", async () => {
			vi.mocked(fs.stat).mockResolvedValue({ size: 1000000 } as any)
			// Simulate binary file by throwing encoding error
			vi.mocked(fs.readFile).mockRejectedValue(new Error("Invalid UTF-8"))

			const result = await validateFileContext("/test/binary.bin", defaultOptions)

			expect(result.canRead).toBe(false)
			expect(result.isBinary).toBe(true)
			expect(result.message).toContain("binary file")
		})

		it("should handle minified files with very long lines", async () => {
			const minifiedContent = "a".repeat(100000) // Single very long line
			vi.mocked(fs.stat).mockResolvedValue({ size: minifiedContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(minifiedContent)

			const result = await validateFileContext("/test/minified.js", defaultOptions)

			expect(result.canRead).toBe(true)
			expect(result.suggestedAction).toBe("read_partial")
			expect(result.message).toContain("minified")
		})

		it("should respect partialReadsEnabled flag", async () => {
			const largeContent = Array(10000).fill("This is a long line of text").join("\n")
			vi.mocked(fs.stat).mockResolvedValue({ size: largeContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(largeContent)

			const noPartialOptions = {
				...defaultOptions,
				partialReadsEnabled: false,
			}

			const result = await validateFileContext("/test/large.txt", noPartialOptions)

			expect(result.canRead).toBe(false)
			expect(result.message).toContain("Partial reads are disabled")
		})
	})

	describe("validateMultipleFiles", () => {
		it("should validate multiple files and track cumulative token usage", async () => {
			const file1Content = "Small file 1"
			const file2Content = "Small file 2"

			vi.mocked(fs.stat)
				.mockResolvedValueOnce({ size: file1Content.length } as any)
				.mockResolvedValueOnce({ size: file2Content.length } as any)

			vi.mocked(fs.readFile).mockResolvedValueOnce(file1Content).mockResolvedValueOnce(file2Content)

			const result = await validateMultipleFiles(["/test/file1.txt", "/test/file2.txt"], defaultOptions)

			expect(result.size).toBe(2)
			const validation1 = result.get("/test/file1.txt")
			const validation2 = result.get("/test/file2.txt")

			expect(validation1?.canRead).toBe(true)
			expect(validation2?.canRead).toBe(true)
		})

		it("should handle when combined files exceed context", async () => {
			// Create files that individually fit but together exceed context
			const largeContent = Array(2000).fill("This is a long line of text").join("\n")

			vi.mocked(fs.stat).mockResolvedValue({ size: largeContent.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(largeContent)

			const result = await validateMultipleFiles(
				["/test/file1.txt", "/test/file2.txt", "/test/file3.txt"],
				defaultOptions,
			)

			// At least one file should be marked for truncation or failure
			const validations = Array.from(result.values())
			const hasPartialReads = validations.some((v) => v.suggestedAction === "read_partial")
			const hasFailures = validations.some((v) => !v.canRead)

			expect(hasPartialReads || hasFailures).toBe(true)
		})
	})

	describe("readFileInChunks", () => {
		it("should read file in chunks", async () => {
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`)
			const content = lines.join("\n")

			vi.mocked(fs.readFile).mockResolvedValue(content)

			const chunks: any[] = []
			for await (const chunk of readFileInChunks("/test/file.txt", 30, 100)) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(1)
			expect(chunks[0].startLine).toBe(1)
			expect(chunks[0].endLine).toBe(30)
			expect(chunks[chunks.length - 1].isLastChunk).toBe(true)
		})

		it("should handle files smaller than chunk size", async () => {
			const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}`)
			const content = lines.join("\n")

			vi.mocked(fs.readFile).mockResolvedValue(content)

			const chunks: any[] = []
			for await (const chunk of readFileInChunks("/test/file.txt", 30, 10)) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBe(1)
			expect(chunks[0].startLine).toBe(1)
			expect(chunks[0].endLine).toBe(10)
			expect(chunks[0].isLastChunk).toBe(true)
		})

		it("should handle empty files", async () => {
			vi.mocked(fs.readFile).mockResolvedValue("")

			const chunks: any[] = []
			for await (const chunk of readFileInChunks("/test/empty.txt", 30, 0)) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBe(0)
		})
	})

	describe("edge cases", () => {
		it("should handle file read errors gracefully", async () => {
			vi.mocked(fs.stat).mockRejectedValue(new Error("File not found"))

			const result = await validateFileContext("/test/nonexistent.txt", defaultOptions)

			expect(result.canRead).toBe(false)
			expect(result.message).toContain("Error reading file")
		})

		it("should handle extremely large safety buffers", async () => {
			const content = "Small file"
			vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(content)

			const highBufferOptions = {
				...defaultOptions,
				config: { ...defaultConfig, safetyBufferPercent: 90 },
			}

			const result = await validateFileContext("/test/file.txt", highBufferOptions)

			// Even small files might not fit with 90% buffer
			expect(result.estimatedTokens).toBeGreaterThan(0)
		})

		it("should handle models with very small context windows", async () => {
			const smallModel = { ...mockModelInfo, contextWindow: 100, maxTokens: 20 }
			const content = "This is a test file with some content"

			vi.mocked(fs.stat).mockResolvedValue({ size: content.length } as any)
			vi.mocked(fs.readFile).mockResolvedValue(content)

			const smallModelOptions = {
				...defaultOptions,
				model: smallModel,
			}

			const result = await validateFileContext("/test/file.txt", smallModelOptions)

			// File might not fit in very small context
			if (!result.canRead) {
				expect(result.message).toContain("exceeds")
			} else {
				expect(result.suggestedAction).toBe("read_partial")
			}
		})
	})
})
