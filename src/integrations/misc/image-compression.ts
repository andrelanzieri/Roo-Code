import sharp from "sharp"

/**
 * Maximum file size in bytes before compression is applied (5MB)
 */
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

/**
 * Compresses an image if it exceeds the maximum file size.
 *
 * @param buffer - The image buffer to potentially compress
 * @param mimeType - The MIME type of the image
 * @returns The compressed buffer and updated MIME type, or original if compression not needed
 */
export async function compressImageIfNeeded(
	buffer: Buffer,
	mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
	// If the image is smaller than 5MB, return as-is
	if (buffer.length <= MAX_FILE_SIZE) {
		return { buffer, mimeType }
	}

	try {
		// Use sharp to compress the image
		let sharpInstance = sharp(buffer)

		// Get image metadata to determine format
		const metadata = await sharpInstance.metadata()

		// Calculate compression quality based on how much we need to reduce
		const targetSize = MAX_FILE_SIZE * 0.9 // Target 90% of max size to leave some margin
		const compressionRatio = targetSize / buffer.length

		// Start with a quality based on the compression ratio
		// Lower quality for larger compression needs
		let quality = Math.max(20, Math.min(95, Math.round(compressionRatio * 100)))

		let compressedBuffer: Buffer
		let attempts = 0
		const maxAttempts = 5

		// Try to compress with progressively lower quality until we get under the limit
		while (attempts < maxAttempts) {
			attempts++

			// Reset sharp instance for each attempt
			sharpInstance = sharp(buffer)

			// Apply format-specific compression
			if (mimeType === "image/png" || metadata.format === "png") {
				// For PNG, convert to JPEG for better compression if needed
				compressedBuffer = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer()

				// If successful, update the mime type
				if (compressedBuffer.length <= MAX_FILE_SIZE) {
					return { buffer: compressedBuffer, mimeType: "image/jpeg" }
				}
			} else if (mimeType === "image/webp" || metadata.format === "webp") {
				compressedBuffer = await sharpInstance.webp({ quality }).toBuffer()

				if (compressedBuffer.length <= MAX_FILE_SIZE) {
					return { buffer: compressedBuffer, mimeType }
				}
			} else {
				// For JPEG and other formats, use JPEG compression
				compressedBuffer = await sharpInstance.jpeg({ quality, mozjpeg: true }).toBuffer()

				if (compressedBuffer.length <= MAX_FILE_SIZE) {
					return { buffer: compressedBuffer, mimeType: "image/jpeg" }
				}
			}

			// If still too large, reduce quality for next attempt
			quality = Math.max(20, quality - 15)
		}

		// If we couldn't compress enough, resize the image as a last resort
		const resizeFactor = Math.sqrt(targetSize / buffer.length)
		const resizedBuffer = await sharp(buffer)
			.resize({
				width: Math.round((metadata.width || 1920) * resizeFactor),
				height: Math.round((metadata.height || 1080) * resizeFactor),
				fit: "inside",
				withoutEnlargement: true,
			})
			.jpeg({ quality: 70, mozjpeg: true })
			.toBuffer()

		return { buffer: resizedBuffer, mimeType: "image/jpeg" }
	} catch (error) {
		// If compression fails for any reason, log the error and return the original
		console.error("Failed to compress image:", error)
		return { buffer, mimeType }
	}
}

/**
 * Checks if an image buffer exceeds the maximum file size
 *
 * @param buffer - The image buffer to check
 * @returns True if the image needs compression
 */
export function needsCompression(buffer: Buffer): boolean {
	return buffer.length > MAX_FILE_SIZE
}

/**
 * Gets a human-readable size string
 *
 * @param bytes - The size in bytes
 * @returns A formatted string like "5.2 MB"
 */
export function formatFileSize(bytes: number): string {
	const mb = bytes / (1024 * 1024)
	return `${mb.toFixed(1)} MB`
}
