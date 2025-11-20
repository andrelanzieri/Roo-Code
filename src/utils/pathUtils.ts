import * as vscode from "vscode"
import * as path from "path"
import * as os from "os"

/**
 * Checks if a file path is outside all workspace folders
 * @param filePath The file path to check
 * @returns true if the path is outside all workspace folders, false otherwise
 */
export function isPathOutsideWorkspace(filePath: string): boolean {
	// If there are no workspace folders, consider everything outside workspace for safety
	if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
		return true
	}

	// Normalize and resolve the path to handle .. and . components correctly
	const absolutePath = path.resolve(filePath)

	// Check if the path is within any workspace folder
	return !vscode.workspace.workspaceFolders.some((folder) => {
		const folderPath = folder.uri.fsPath
		// Path is inside a workspace if it equals the workspace path or is a subfolder
		return absolutePath === folderPath || absolutePath.startsWith(folderPath + path.sep)
	})
}

/**
 * Simple wildcard pattern matching
 * Supports * (matches any characters) and ? (matches single character)
 * @param text The text to match
 * @param pattern The pattern with wildcards
 * @returns true if text matches pattern, false otherwise
 */
function matchWildcard(text: string, pattern: string): boolean {
	// Convert pattern to regex, escaping special regex chars except * and ?
	const regexPattern = pattern
		.split(/(\*|\?)/)
		.map((part, index) => {
			if (part === "*") return ".*"
			if (part === "?") return "."
			// Escape special regex characters in literal parts
			return part.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		})
		.join("")

	const regex = new RegExp(`^${regexPattern}$`, process.platform === "win32" ? "i" : "")
	return regex.test(text)
}

/**
 * Checks if a file path matches any of the allowed directories patterns.
 * Supports wildcards (*) for pattern matching.
 * @param filePath The file path to check
 * @param allowedDirectories List of allowed directory patterns
 * @returns true if the path matches any allowed directory pattern, false otherwise
 */
export function isPathInAllowedDirectories(filePath: string, allowedDirectories: string[] | undefined): boolean {
	if (!allowedDirectories || allowedDirectories.length === 0) {
		return false
	}

	// Normalize and resolve the file path
	const absoluteFilePath = path.resolve(filePath)

	for (const pattern of allowedDirectories) {
		// Expand tilde to home directory if pattern starts with ~
		let expandedPattern = pattern
		if (pattern.startsWith("~")) {
			expandedPattern = pattern.replace(/^~/, os.homedir())
		}

		// Convert to absolute path if not already
		const absolutePattern = path.isAbsolute(expandedPattern) ? expandedPattern : path.resolve(expandedPattern)

		// Check if pattern contains wildcards
		if (absolutePattern.includes("*") || absolutePattern.includes("?")) {
			// Check if this is a simple file pattern (e.g., /path/file???.txt)
			const basename = path.basename(absolutePattern)
			if (
				(basename.includes("*") || basename.includes("?")) &&
				!path.dirname(absolutePattern).includes("*") &&
				!path.dirname(absolutePattern).includes("?")
			) {
				// It's a file pattern - check if file is in correct directory with matching filename
				const dirPath = path.dirname(absolutePattern)
				if (path.dirname(absoluteFilePath) === dirPath) {
					if (matchWildcard(path.basename(absoluteFilePath), basename)) {
						return true
					}
				}
			} else {
				// Directory pattern with wildcards (e.g., /usr/include/Qt*)
				// We need to check if the file is under a directory that matches the pattern

				// For patterns like /usr/include/Qt*, we want to match:
				// - Files directly in /usr/include/Qt (if Qt matches Qt*)
				// - Files in /usr/include/QtCore (if QtCore matches Qt*)
				// - Files in subdirectories of matching directories

				// Get the directory containing the file
				let checkPath = path.dirname(absoluteFilePath)

				// Check each parent directory up to root
				while (checkPath) {
					// Check if this directory matches the pattern
					if (matchWildcard(checkPath, absolutePattern)) {
						// The file is in or under a directory that matches the pattern
						return true
					}

					// Move up to parent directory
					const parent = path.dirname(checkPath)
					if (parent === checkPath) {
						// Reached root
						break
					}
					checkPath = parent
				}

				// Also check if the file path itself matches (for completeness)
				if (matchWildcard(absoluteFilePath, absolutePattern)) {
					return true
				}
			}
		} else {
			// For non-wildcard patterns, treat as directory prefix
			// Remove trailing slashes for consistent comparison
			let normalizedAbsPattern = absolutePattern
			if (normalizedAbsPattern.endsWith(path.sep) && normalizedAbsPattern !== path.sep) {
				normalizedAbsPattern = normalizedAbsPattern.slice(0, -1)
			}

			// Special case for root path
			if (normalizedAbsPattern === path.sep || normalizedAbsPattern === "") {
				return true // All files are under root
			}

			// Check if the file path is within this directory
			if (
				absoluteFilePath === normalizedAbsPattern ||
				absoluteFilePath.startsWith(normalizedAbsPattern + path.sep)
			) {
				return true
			}
		}
	}

	return false
}
