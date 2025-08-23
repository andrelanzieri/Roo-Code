import * as fs from "fs"
import * as path from "path"

/**
 * Detects if a directory contains a Swift project
 * @param dirPath - The directory path to check
 * @returns true if it's a Swift project, false otherwise
 */
export async function isSwiftProject(dirPath: string): Promise<boolean> {
	try {
		// Check for common Swift project indicators
		const swiftIndicators = [
			"Package.swift", // Swift Package Manager
			"*.xcodeproj", // Xcode project
			"*.xcworkspace", // Xcode workspace
			"Podfile", // CocoaPods
			"Cartfile", // Carthage
		]

		const entries = await fs.promises.readdir(dirPath)

		for (const entry of entries) {
			// Check for exact matches
			if (swiftIndicators.includes(entry)) {
				return true
			}

			// Check for pattern matches (e.g., *.xcodeproj)
			for (const indicator of swiftIndicators) {
				if (indicator.includes("*")) {
					const pattern = indicator.replace("*", "")
					if (entry.endsWith(pattern)) {
						return true
					}
				}
			}
		}

		// Also check if there are .swift files in the root directory
		const swiftFiles = entries.filter((entry) => entry.endsWith(".swift"))
		if (swiftFiles.length > 0) {
			return true
		}

		// Check for iOS/macOS specific directories
		const iosIndicators = ["Sources", "Tests", "UITests"]
		for (const indicator of iosIndicators) {
			const indicatorPath = path.join(dirPath, indicator)
			try {
				const stats = await fs.promises.stat(indicatorPath)
				if (stats.isDirectory()) {
					// Check if this directory contains Swift files
					const subEntries = await fs.promises.readdir(indicatorPath)
					const hasSwiftFiles = subEntries.some((entry) => entry.endsWith(".swift"))
					if (hasSwiftFiles) {
						return true
					}
				}
			} catch {
				// Directory doesn't exist, continue checking
			}
		}

		return false
	} catch (error) {
		console.error(`Error detecting Swift project: ${error}`)
		return false
	}
}

/**
 * Gets the recommended file limit for a project based on its type
 * @param dirPath - The directory path to check
 * @param defaultLimit - The default limit to use
 * @returns The recommended file limit
 */
export async function getProjectFileLimit(dirPath: string, defaultLimit: number): Promise<number> {
	// For Swift projects, use a more conservative limit to prevent memory issues
	if (await isSwiftProject(dirPath)) {
		// Swift projects often have large dependency trees and generated files
		// Use a smaller limit to prevent memory exhaustion
		return Math.min(defaultLimit, 100)
	}

	return defaultLimit
}
