import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { normalizeImageRefsToDataUrls, normalizeDataUrlsToFilePaths } from "../imageDataUrl"
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"

// Mock fs module
vi.mock("fs/promises")

describe("normalizeImageRefsToDataUrls", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should pass through data URLs unchanged", async () => {
		const dataUrl =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="
		const result = await normalizeImageRefsToDataUrls([dataUrl])

		expect(result).toEqual([dataUrl])
	})

	it("should convert CDN webview URIs to data URLs", async () => {
		const cdnUri = "https://file+.vscode-resource.vscode-cdn.net/path/to/test.png"
		const mockBuffer = Buffer.from("test image data")

		vi.mocked(fs.readFile).mockResolvedValue(mockBuffer)

		const result = await normalizeImageRefsToDataUrls([cdnUri])

		expect(result).toHaveLength(1)
		expect(result[0]).toMatch(/^data:image\/png;base64,/)
		const expectedPath = path.normalize("/path/to/test.png")
		expect(fs.readFile).toHaveBeenCalledWith(expectedPath)
	})

	it("should handle mixed arrays of data URLs and CDN URIs", async () => {
		const dataUrl = "data:image/jpeg;base64,test123"
		const cdnUri = "https://file+.vscode-resource.vscode-cdn.net/path/to/test.png"
		const mockBuffer = Buffer.from("test image data")

		vi.mocked(fs.readFile).mockResolvedValue(mockBuffer)

		const result = await normalizeImageRefsToDataUrls([dataUrl, cdnUri])

		expect(result).toHaveLength(2)
		expect(result[0]).toBe(dataUrl) // Data URL unchanged
		expect(result[1]).toMatch(/^data:image\/png;base64,/) // CDN URI converted
	})

	it("should handle errors gracefully by skipping problematic images", async () => {
		const validDataUrl = "data:image/png;base64,valid"
		const invalidCdnUri = "vscode-file://vscode-app/nonexistent/test.png"

		vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))

		const result = await normalizeImageRefsToDataUrls([validDataUrl, invalidCdnUri])

		expect(result).toEqual([validDataUrl]) // Only valid ones returned
	})

	it("should handle empty arrays", async () => {
		const result = await normalizeImageRefsToDataUrls([])
		expect(result).toEqual([])
	})
})

describe("normalizeDataUrlsToFilePaths", () => {
	const testGlobalStoragePath = path.join(os.tmpdir(), "test-roo-code-storage")

	beforeEach(async () => {
		vi.clearAllMocks()
		// Mock mkdir to succeed
		vi.mocked(fs.mkdir).mockResolvedValue(undefined)
		// Mock writeFile to succeed
		vi.mocked(fs.writeFile).mockResolvedValue(undefined)
		// Mock access to fail initially (file doesn't exist)
		vi.mocked(fs.access).mockRejectedValue(new Error("File not found"))
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("should pass through non-data URLs unchanged", async () => {
		const filePath = "/path/to/image.png"
		const result = await normalizeDataUrlsToFilePaths([filePath], testGlobalStoragePath)

		expect(result).toEqual([filePath])
		expect(fs.writeFile).not.toHaveBeenCalled()
	})

	it("should convert data URLs to file paths", async () => {
		const dataUrl =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=="

		const result = await normalizeDataUrlsToFilePaths([dataUrl], testGlobalStoragePath)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatch(/temp-images/)
		expect(result[0]).toMatch(/\.png$/)
		expect(fs.mkdir).toHaveBeenCalledWith(
			expect.stringContaining("temp-images"),
			expect.objectContaining({ recursive: true }),
		)
		expect(fs.writeFile).toHaveBeenCalledWith(expect.stringMatching(/temp-images.*\.png$/), expect.any(Buffer))
	})

	it("should handle mixed arrays of data URLs and file paths", async () => {
		const dataUrl = "data:image/jpeg;base64,test123"
		const filePath = "/existing/image.png"

		const result = await normalizeDataUrlsToFilePaths([filePath, dataUrl], testGlobalStoragePath)

		expect(result).toHaveLength(2)
		expect(result[0]).toBe(filePath) // File path unchanged
		expect(result[1]).toMatch(/temp-images/) // Data URL converted
		expect(result[1]).toMatch(/\.jpeg$/) // Correct extension from MIME type
	})

	it("should reuse cached file paths for same data URL", async () => {
		const dataUrl = "data:image/png;base64,test123"

		// First call - should write file
		const result1 = await normalizeDataUrlsToFilePaths([dataUrl], testGlobalStoragePath)
		expect(fs.writeFile).toHaveBeenCalledTimes(1)

		// Mock file exists for second call
		vi.mocked(fs.access).mockResolvedValue(undefined)

		// Second call - should use cached path
		const result2 = await normalizeDataUrlsToFilePaths([dataUrl], testGlobalStoragePath)

		expect(result1[0]).toBe(result2[0]) // Same path returned
		expect(fs.writeFile).toHaveBeenCalledTimes(1) // Not written again
	})

	it("should handle errors gracefully", async () => {
		const dataUrl = "data:image/png;base64,test"

		// Mock writeFile to fail
		vi.mocked(fs.writeFile).mockRejectedValue(new Error("Write failed"))

		const result = await normalizeDataUrlsToFilePaths([dataUrl], testGlobalStoragePath)

		// Should return original data URL as fallback
		expect(result).toEqual([dataUrl])
	})

	it("should handle invalid data URL format", async () => {
		const invalidDataUrl = "data:image/png" // Missing base64 data

		const result = await normalizeDataUrlsToFilePaths([invalidDataUrl], testGlobalStoragePath)

		// Should skip invalid URLs
		expect(result).toHaveLength(0)
	})

	it("should handle empty arrays", async () => {
		const result = await normalizeDataUrlsToFilePaths([], testGlobalStoragePath)
		expect(result).toEqual([])
	})

	it("should extract correct file extensions from MIME types", async () => {
		const testCases = [
			{ dataUrl: "data:image/png;base64,test", expectedExt: ".png" },
			{ dataUrl: "data:image/jpeg;base64,test", expectedExt: ".jpeg" },
			{ dataUrl: "data:image/gif;base64,test", expectedExt: ".gif" },
			{ dataUrl: "data:image/webp;base64,test", expectedExt: ".webp" },
		]

		for (const { dataUrl, expectedExt } of testCases) {
			const result = await normalizeDataUrlsToFilePaths([dataUrl], testGlobalStoragePath)
			expect(result[0]).toMatch(new RegExp(`${expectedExt.replace(".", "\\.")}$`))
		}
	})
})
