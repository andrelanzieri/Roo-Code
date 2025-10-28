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
