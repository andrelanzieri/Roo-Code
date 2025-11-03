import * as fs from "fs/promises"
import * as path from "path"
import * as crypto from "crypto"
import { getImageBase64ForPath, setImageBase64ForPath } from "./image-cache"

/**
 * Converts webview URIs to base64 data URLs for API calls.
 * Simple fallback for cases where base64 isn't already stored in messages.
 * This is the missing piece from PR #8225 that allows webview URIs
 * to be used in frontend while converting to base64 for API calls.
 */
export async function normalizeImageRefsToDataUrls(imageRefs: string[]): Promise<string[]> {
	const results: string[] = []

	for (const imageRef of imageRefs) {
		// If it's already a data URL, keep it as is
		if (imageRef.startsWith("data:image/")) {
			results.push(imageRef)
			continue
		}

		// Convert webview URI to file path and then to base64
		try {
			const filePath = webviewUriToFilePath(imageRef)

			// If the image originated from the UI as base64 and was cached, use it to avoid re-encoding
			const cached = getImageBase64ForPath(filePath)
			if (cached) {
				results.push(cached)
				continue
			}

			const buffer = await fs.readFile(filePath)
			const base64 = buffer.toString("base64")
			const mimeType = getMimeTypeFromPath(filePath)
			const dataUrl = `data:${mimeType};base64,${base64}`
			results.push(dataUrl)
		} catch (error) {
			console.error("Failed to convert webview URI to base64:", imageRef, error)
			// Skip this image
		}
	}

	return results
}

/**
 * Converts base64 data URLs to file paths suitable for webview URIs.
 * Writes base64 images to temporary files and returns their paths.
 *
 * NOTE: This function is primarily used for testing. In production, the dual-storage
 * approach (images + imagesBase64 in ClineMessage) eliminates the need for this conversion.
 * No caching is implemented since this is a test utility.
 */
export async function normalizeDataUrlsToFilePaths(dataUrls: string[], globalStoragePath: string): Promise<string[]> {
	const results: string[] = []

	// Ensure temp directory exists
	const tempDir = path.join(globalStoragePath, "temp-images")
	try {
		await fs.mkdir(tempDir, { recursive: true })
	} catch (error) {
		console.error("Failed to create temp-images directory:", error)
		return dataUrls // Return original data URLs as fallback
	}

	for (const dataUrl of dataUrls) {
		// If it's not a data URL, keep it as is (might be a file path already)
		if (!dataUrl.startsWith("data:image/")) {
			results.push(dataUrl)
			continue
		}

		try {
			// Extract base64 data and MIME type
			const commaIndex = dataUrl.indexOf(",")
			if (commaIndex === -1) {
				console.error("Invalid data URL format:", dataUrl.substring(0, 50))
				continue
			}

			const header = dataUrl.substring(0, commaIndex)
			const base64Data = dataUrl.substring(commaIndex + 1)

			// Determine file extension from MIME type
			const mimeMatch = header.match(/data:image\/([^;]+)/)
			const extension = mimeMatch ? `.${mimeMatch[1]}` : ".png"

			// Create a unique hash for this image
			const hash = crypto.createHash("md5").update(dataUrl).digest("hex")

			// Write to temp file
			const filePath = path.join(tempDir, `${hash}${extension}`)
			const buffer = Buffer.from(base64Data, "base64")
			await fs.writeFile(filePath, buffer)

			// Cache the reverse mapping for image-cache lookups
			setImageBase64ForPath(filePath, dataUrl)

			results.push(filePath)
		} catch (error) {
			console.error("Failed to convert base64 data URL to file path:", error)
			// Keep the original data URL as fallback
			results.push(dataUrl)
		}
	}

	return results
}

/**
 * Converts a webview URI to a file system path
 */
function webviewUriToFilePath(webviewUri: string): string {
	// Handle VS Code CDN-style webview URLs:
	// Example: https://file+.vscode-resource.vscode-cdn.net/file/<absolute_path_to_image>
	if (webviewUri.startsWith("https://")) {
		try {
			const u = new URL(webviewUri)
			if (u.host === "vscode-cdn.net" || u.host.endsWith(".vscode-cdn.net")) {
				// Path is like /file/<abs-path> - strip the /file/ prefix
				let p = u.pathname || ""
				if (p.startsWith("/file/")) {
					p = p.slice("/file/".length)
				}
				return path.normalize(decodeURIComponent(p))
			}
		} catch {
			throw new Error("Invalid URL")
		}
	}
	// As a last resort, try treating it as a file path
	return webviewUri
}

/**
 * Gets the MIME type from a file path
 */

function getMimeTypeFromPath(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase()

	switch (ext) {
		case ".png":
			return "image/png"
		case ".jpg":
		case ".jpeg":
			return "image/jpeg"
		case ".gif":
			return "image/gif"
		case ".webp":
			return "image/webp"
		case ".svg":
			return "image/svg+xml"
		case ".bmp":
			return "image/bmp"
		default:
			return "image/png"
	}
}
