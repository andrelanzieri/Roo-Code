import { describe, it, expect, vi, beforeEach } from "vitest"
import sharp from "sharp"
import { compressImageIfNeeded, needsCompression, formatFileSize } from "../image-compression"

vi.mock("sharp")

describe("image-compression", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("needsCompression", () => {
		it("should return false for images under 5MB", () => {
			const smallBuffer = Buffer.alloc(3 * 1024 * 1024) // 3MB
			expect(needsCompression(smallBuffer)).toBe(false)
		})

		it("should return true for images over 5MB", () => {
			const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
			expect(needsCompression(largeBuffer)).toBe(true)
		})

		it("should return false for images exactly 5MB", () => {
			const exactBuffer = Buffer.alloc(5 * 1024 * 1024) // 5MB
			expect(needsCompression(exactBuffer)).toBe(false)
		})
	})

	describe("formatFileSize", () => {
		it("should format bytes to MB correctly", () => {
			expect(formatFileSize(1024 * 1024)).toBe("1.0 MB")
			expect(formatFileSize(5.5 * 1024 * 1024)).toBe("5.5 MB")
			expect(formatFileSize(10.25 * 1024 * 1024)).toBe("10.3 MB")
		})
	})

	describe("compressImageIfNeeded", () => {
		it("should return original buffer if under 5MB", async () => {
			const smallBuffer = Buffer.alloc(3 * 1024 * 1024) // 3MB
			const mimeType = "image/jpeg"

			const result = await compressImageIfNeeded(smallBuffer, mimeType)

			expect(result.buffer).toBe(smallBuffer)
			expect(result.mimeType).toBe(mimeType)
			expect(sharp).not.toHaveBeenCalled()
		})

		it("should compress JPEG images over 5MB", async () => {
			const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
			const compressedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/jpeg"

			const mockMetadata = {
				format: "jpeg",
				width: 4000,
				height: 3000,
			}

			const mockSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(compressedBuffer),
			}

			vi.mocked(sharp).mockReturnValue(mockSharp as any)

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			expect(sharp).toHaveBeenCalledWith(largeBuffer)
			expect(mockSharp.jpeg).toHaveBeenCalledWith({
				quality: expect.any(Number),
				mozjpeg: true,
			})
			expect(result.buffer).toBe(compressedBuffer)
			expect(result.mimeType).toBe("image/jpeg")
		}, 30000) // Increase timeout to 30 seconds

		it("should convert PNG to JPEG for better compression", async () => {
			const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
			const compressedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/png"

			const mockMetadata = {
				format: "png",
				width: 4000,
				height: 3000,
			}

			const mockSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(compressedBuffer),
			}

			vi.mocked(sharp).mockReturnValue(mockSharp as any)

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			expect(mockSharp.jpeg).toHaveBeenCalled()
			expect(result.buffer).toBe(compressedBuffer)
			expect(result.mimeType).toBe("image/jpeg") // Should be converted to JPEG
		})

		it("should compress WebP images", async () => {
			const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
			const compressedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/webp"

			const mockMetadata = {
				format: "webp",
				width: 4000,
				height: 3000,
			}

			const mockSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				webp: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(compressedBuffer),
			}

			vi.mocked(sharp).mockReturnValue(mockSharp as any)

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			expect(mockSharp.webp).toHaveBeenCalledWith({
				quality: expect.any(Number),
			})
			expect(result.buffer).toBe(compressedBuffer)
			expect(result.mimeType).toBe("image/webp")
		})

		it("should progressively reduce quality if initial compression is insufficient", async () => {
			const largeBuffer = Buffer.alloc(8 * 1024 * 1024) // 8MB
			const stillLargeBuffer = Buffer.alloc(5.5 * 1024 * 1024) // 5.5MB
			const compressedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/jpeg"

			const mockMetadata = {
				format: "jpeg",
				width: 4000,
				height: 3000,
			}

			const mockSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi
					.fn()
					.mockResolvedValueOnce(stillLargeBuffer) // First attempt still too large
					.mockResolvedValueOnce(compressedBuffer), // Second attempt successful
			}

			vi.mocked(sharp).mockReturnValue(mockSharp as any)

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			expect(mockSharp.toBuffer).toHaveBeenCalledTimes(2)
			expect(result.buffer).toBe(compressedBuffer)
		})

		it("should resize image as last resort if compression alone fails", async () => {
			const largeBuffer = Buffer.alloc(15 * 1024 * 1024) // 15MB
			const stillLargeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB (still too large)
			const resizedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/jpeg"

			const mockMetadata = {
				format: "jpeg",
				width: 4000,
				height: 3000,
			}

			// Track the number of sharp calls
			let sharpCallCount = 0

			// Mock for metadata call
			const mockMetadataSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
			}

			// Mock for compression attempts (will fail)
			const mockCompressSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(stillLargeBuffer), // Still too large
			}

			// Mock for resize operation
			const mockResizeSharp = {
				resize: vi.fn().mockReturnThis(),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(resizedBuffer),
			}

			vi.mocked(sharp).mockImplementation(() => {
				sharpCallCount++

				// First call is for metadata
				if (sharpCallCount === 1) {
					return mockMetadataSharp as any
				}
				// Next 5 calls are compression attempts
				else if (sharpCallCount <= 6) {
					return mockCompressSharp as any
				}
				// Last call is for resize
				else {
					return mockResizeSharp as any
				}
			})

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			// Verify resize was called
			expect(mockResizeSharp.resize).toHaveBeenCalledWith({
				width: expect.any(Number),
				height: expect.any(Number),
				fit: "inside",
				withoutEnlargement: true,
			})
			expect(result.buffer).toBe(resizedBuffer)

			// Verify the correct number of sharp calls were made
			expect(sharpCallCount).toBe(7) // 1 metadata + 5 compression attempts + 1 resize
		}, 30000) // Increase timeout to 30 seconds

		it("should handle compression errors gracefully", async () => {
			const largeBuffer = Buffer.alloc(6 * 1024 * 1024) // 6MB
			const mimeType = "image/jpeg"

			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

			vi.mocked(sharp).mockImplementation(() => {
				throw new Error("Sharp processing failed")
			})

			const result = await compressImageIfNeeded(largeBuffer, mimeType)

			expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to compress image:", expect.any(Error))
			expect(result.buffer).toBe(largeBuffer) // Should return original
			expect(result.mimeType).toBe(mimeType)

			consoleErrorSpy.mockRestore()
		})

		it("should calculate quality based on compression ratio", async () => {
			const largeBuffer = Buffer.alloc(7 * 1024 * 1024) // 7MB
			const compressedBuffer = Buffer.alloc(4 * 1024 * 1024) // 4MB
			const mimeType = "image/jpeg"

			const mockMetadata = {
				format: "jpeg",
				width: 4000,
				height: 3000,
			}

			const mockSharp = {
				metadata: vi.fn().mockResolvedValue(mockMetadata),
				jpeg: vi.fn().mockReturnThis(),
				toBuffer: vi.fn().mockResolvedValue(compressedBuffer),
			}

			vi.mocked(sharp).mockReturnValue(mockSharp as any)

			await compressImageIfNeeded(largeBuffer, mimeType)

			// Target size is 90% of 5MB = 4.5MB
			// Compression ratio = 4.5MB / 7MB ≈ 0.64
			// Quality = 0.64 * 100 = 64
			expect(mockSharp.jpeg).toHaveBeenCalledWith({
				quality: 64,
				mozjpeg: true,
			})
		})
	})
})
