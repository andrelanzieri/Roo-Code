import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { getStorageBasePath } from "../storage"

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
	window: {
		showErrorMessage: vi.fn(),
	},
}))

// Mock fs/promises module
vi.mock("fs/promises", () => ({
	mkdir: vi.fn(),
	writeFile: vi.fn(),
	rm: vi.fn(),
}))

describe("storage", () => {
	const mockFs = fs as any
	const mockVscode = vscode as any

	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	describe("getStorageBasePath", () => {
		const defaultPath = "/default/storage/path"

		it("should return default path when no custom path is configured", async () => {
			mockVscode.workspace.getConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(""),
			})

			const result = await getStorageBasePath(defaultPath)
			expect(result).toBe(defaultPath)
		})

		it("should return default path when vscode configuration is not accessible", async () => {
			mockVscode.workspace.getConfiguration.mockImplementation(() => {
				throw new Error("VSCode not available")
			})

			const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
			const result = await getStorageBasePath(defaultPath)

			expect(result).toBe(defaultPath)
			expect(consoleSpy).toHaveBeenCalledWith("Could not access VSCode configuration - using default path")

			consoleSpy.mockRestore()
		})

		it("should return custom path when it is writable", async () => {
			const customPath = "/custom/storage/path"

			mockVscode.workspace.getConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(customPath),
			})

			mockFs.mkdir.mockResolvedValue(undefined)
			mockFs.writeFile.mockResolvedValue(undefined)
			mockFs.rm.mockResolvedValue(undefined)

			const result = await getStorageBasePath(defaultPath)

			expect(result).toBe(customPath)
			expect(mockFs.mkdir).toHaveBeenCalledWith(customPath, { recursive: true })
			expect(mockFs.writeFile).toHaveBeenCalledWith(
				expect.stringMatching(/\.write_test_\d+_\d+_[a-z0-9]+$/),
				"test",
			)
			expect(mockFs.rm).toHaveBeenCalledWith(expect.stringMatching(/\.write_test_\d+_\d+_[a-z0-9]+$/))
		})

		it("should return default path when custom path is not writable", async () => {
			const customPath = "/custom/storage/path"

			mockVscode.workspace.getConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(customPath),
			})

			mockFs.mkdir.mockResolvedValue(undefined)
			mockFs.writeFile.mockRejectedValue(new Error("Permission denied"))

			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			const result = await getStorageBasePath(defaultPath)

			expect(result).toBe(defaultPath)
			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Custom storage path is unusable"))
			expect(mockVscode.window.showErrorMessage).toHaveBeenCalled()

			consoleSpy.mockRestore()
		})

		it("should handle concurrent calls without race conditions", async () => {
			const customPath = "/custom/storage/path"

			mockVscode.workspace.getConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(customPath),
			})

			mockFs.mkdir.mockResolvedValue(undefined)
			mockFs.writeFile.mockResolvedValue(undefined)
			mockFs.rm.mockResolvedValue(undefined)

			// Simulate multiple concurrent calls
			const promises = Array.from({ length: 10 }, () => getStorageBasePath(defaultPath))
			const results = await Promise.all(promises)

			// All should return the custom path
			results.forEach((result) => {
				expect(result).toBe(customPath)
			})

			// Check that each call used a unique test file
			const writeFileCalls = mockFs.writeFile.mock.calls
			const testFilePaths = writeFileCalls.map((call: any[]) => call[0])
			const uniquePaths = new Set(testFilePaths)

			// Each concurrent call should have used a unique test file
			expect(uniquePaths.size).toBe(10)

			// All test files should have unique suffixes
			testFilePaths.forEach((filePath: string) => {
				expect(filePath).toMatch(/\.write_test_\d+_\d+_[a-z0-9]+$/)
			})
		})

		it("should use unique test file names with process ID, timestamp, and random suffix", async () => {
			const customPath = "/custom/storage/path"

			mockVscode.workspace.getConfiguration.mockReturnValue({
				get: vi.fn().mockReturnValue(customPath),
			})

			mockFs.mkdir.mockResolvedValue(undefined)
			mockFs.writeFile.mockResolvedValue(undefined)
			mockFs.rm.mockResolvedValue(undefined)

			const processId = process.pid
			const beforeTime = Date.now()

			await getStorageBasePath(defaultPath)

			const afterTime = Date.now()

			const writeFileCall = mockFs.writeFile.mock.calls[0]
			const testFilePath = writeFileCall[0]

			// Extract the suffix from the test file path
			const match = testFilePath.match(/\.write_test_(\d+)_(\d+)_([a-z0-9]+)$/)
			expect(match).toBeTruthy()

			const [, pid, timestamp, random] = match

			// Verify process ID
			expect(parseInt(pid)).toBe(processId)

			// Verify timestamp is within expected range
			const ts = parseInt(timestamp)
			expect(ts).toBeGreaterThanOrEqual(beforeTime)
			expect(ts).toBeLessThanOrEqual(afterTime)

			// Verify random suffix format
			expect(random).toMatch(/^[a-z0-9]{7}$/)
		})
	})
})
