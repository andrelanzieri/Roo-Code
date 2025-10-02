/**
 * Normalizes a path for consistent comparison
 * - Resolves ./.. segments
 * - Removes duplicate slashes
 * - Standardizes path separators
 * - Removes trailing slashes (except for root paths)
 */
function normalizePath(p: string): string {
	if (!p) return ""

	// First, replace all backslashes with forward slashes for consistency
	let normalized = p.replace(/\\/g, "/")

	// Remove duplicate slashes
	normalized = normalized.replace(/\/+/g, "/")

	// Handle drive letters on Windows (e.g., C:/ -> C:/)
	if (/^[a-zA-Z]:/.test(normalized)) {
		// Ensure drive letter is uppercase for consistency
		normalized = normalized[0].toUpperCase() + normalized.slice(1)
	}

	// Split into parts and resolve . and .. segments
	const parts = normalized.split("/")
	const resolved: string[] = []

	for (const part of parts) {
		if (part === "..") {
			resolved.pop()
		} else if (part !== "." && part !== "") {
			resolved.push(part)
		} else if (part === "" && resolved.length === 0) {
			// Keep the first empty part for absolute paths
			resolved.push(part)
		}
	}

	// Rejoin the parts
	normalized = resolved.join("/")

	// Ensure absolute paths start with /
	if (p.startsWith("/") && !normalized.startsWith("/")) {
		normalized = "/" + normalized
	}

	// Remove trailing slash, except for root paths
	if (normalized.length > 1 && normalized.endsWith("/")) {
		// Don't remove trailing slash from root paths like "/" or "C:/"
		if (!(normalized === "/" || /^[a-zA-Z]:\/$/i.test(normalized))) {
			normalized = normalized.slice(0, -1)
		}
	}

	return normalized
}

/**
 * Safe path comparison that works across different platforms
 * Handles case-insensitive comparison on Windows and normalizes paths
 * This is especially important for comparing workspace paths like Desktop directory
 */
export function arePathsEqual(path1?: string, path2?: string): boolean {
	if (!path1 && !path2) {
		return true
	}
	if (!path1 || !path2) {
		return false
	}

	path1 = normalizePath(path1)
	path2 = normalizePath(path2)

	// Windows paths are case-insensitive
	if (process.platform === "win32") {
		return path1.toLowerCase() === path2.toLowerCase()
	}

	return path1 === path2
}
