import { describe, it, expect, vi, beforeEach } from "vitest"
import { normalizeImageRefsToDataUrls } from "../imageDataUrl"
import * as fs from "fs/promises"

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

	it("should convert webview URIs to data URLs", async () => {
		const webviewUri = "file:///path/to/test.png"
		const mockBuffer = Buffer.from("test image data")

		vi.mocked(fs.readFile).mockResolvedValue(mockBuffer)

		const result = await normalizeImageRefsToDataUrls([webviewUri])

		expect(result).toHaveLength(1)
		expect(result[0]).toMatch(/^data:image\/png;base64,/)
		expect(fs.readFile).toHaveBeenCalledWith("/path/to/test.png")
	})

	it("should handle mixed arrays of data URLs and webview URIs", async () => {
		const dataUrl = "data:image/jpeg;base64,test123"
		const webviewUri = "file:///path/to/test.png"
		const mockBuffer = Buffer.from("test image data")

		vi.mocked(fs.readFile).mockResolvedValue(mockBuffer)

		const result = await normalizeImageRefsToDataUrls([dataUrl, webviewUri])

		expect(result).toHaveLength(2)
		expect(result[0]).toBe(dataUrl) // Data URL unchanged
		expect(result[1]).toMatch(/^data:image\/png;base64,/) // Webview URI converted
	})

	it("should handle errors gracefully by skipping problematic images", async () => {
		const validDataUrl = "data:image/png;base64,valid"
		const invalidWebviewUri = "file:///nonexistent/test.png"

		vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))

		const result = await normalizeImageRefsToDataUrls([validDataUrl, invalidWebviewUri])

		expect(result).toEqual([validDataUrl]) // Only valid ones returned
	})

	it("should handle empty arrays", async () => {
		const result = await normalizeImageRefsToDataUrls([])
		expect(result).toEqual([])
	})
})
