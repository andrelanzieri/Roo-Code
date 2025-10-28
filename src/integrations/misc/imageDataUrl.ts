import * as fs from "fs/promises"
import * as path from "path"

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
			// fall through if not a valid URL or not the expected host
		}
	}

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
	// Use strict prefix matching to prevent arbitrary host injection
	if (webviewUri.startsWith("vscode-resource://vscode-webview/") && webviewUri.includes("vscode-userdata")) {
		try {
			// Decode safely with length limits
			if (webviewUri.length > 2048) {
				throw new Error("URI too long")
			}

			const decoded = decodeURIComponent(webviewUri)

			// Use specific, bounded patterns to prevent ReDoS
			// Match exact patterns without backtracking
			const unixMatch = decoded.match(
				/^[^?#]*\/Users\/[a-zA-Z0-9._-]{1,50}\/[^?#]{1,300}\.(png|jpg|jpeg|gif|webp)$/i,
			)
			if (unixMatch) {
				return unixMatch[0]
			}

			const windowsMatch = decoded.match(/^[^?#]*[A-Za-z]:\\[^?#]{1,300}\.(png|jpg|jpeg|gif|webp)$/i)
			if (windowsMatch) {
				return windowsMatch[0]
			}
		} catch (error) {
			console.error("Failed to decode webview URI:", error)
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
