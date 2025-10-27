import * as fs from "fs/promises"
import * as path from "path"

/**
 * Converts webview URIs to base64 data URLs for API calls.
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
 * Converts a webview URI to a file system path
 */
function webviewUriToFilePath(webviewUri: string): string {
	// Handle vscode-resource URIs like:
	// vscode-resource://vscode-webview/path/to/file
	if (webviewUri.includes("vscode-resource://")) {
		// Extract the path portion after vscode-resource://vscode-webview/
		const match = webviewUri.match(/vscode-resource:\/\/[^\/]+(.+)/)
		if (match) {
			return decodeURIComponent(match[1])
		}
	}

	// Handle file:// URIs
	if (webviewUri.startsWith("file://")) {
		return decodeURIComponent(webviewUri.substring(7))
	}

	// Handle VS Code webview URIs that contain encoded paths
	if (webviewUri.includes("vscode-userdata") || webviewUri.includes("vscode-cdn.net")) {
		// Try to decode the URI and extract the file path
		const decoded = decodeURIComponent(webviewUri)
		// Look for a file path pattern in the decoded URI
		const pathMatch = decoded.match(/(?:Users|C:)([^?#]+\.(?:png|jpg|jpeg|gif|webp))/i)
		if (pathMatch) {
			const extractedPath = pathMatch[0]
			return extractedPath
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
