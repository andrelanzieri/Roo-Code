/**
 * Detects potential AI-generated code omissions in the given file content.
 * Uses pattern matching to identify comments that indicate truncated or omitted code,
 * while avoiding false positives from legitimate documentation comments.
 * @param originalFileContent The original content of the file.
 * @param newFileContent The new content of the file to check.
 * @returns True if a potential omission is detected, false otherwise.
 */
export function detectCodeOmission(originalFileContent: string, newFileContent: string): boolean {
	const actualLineCount = newFileContent.split("\n").length

	// Skip checks for small files (less than 100 lines)
	if (actualLineCount < 100) {
		return false
	}

	const originalLines = originalFileContent.split("\n")
	const newLines = newFileContent.split("\n")

	// More specific patterns that strongly indicate actual code omissions
	// These patterns are much more likely to be AI-generated placeholders
	const strongOmissionPatterns = [
		/\.\.\.\s*(rest|remainder|remaining|more)\s+(of|code|content|unchanged)/i,
		/\.\.\.\s*$/, // Just ellipsis at end of line
		/^\s*\/\/\s*\.\.\./, // Comment starting with ellipsis
		/^\s*#\s*\.\.\./, // Python comment starting with ellipsis
		/(rest|remainder|remaining)\s+of\s+(the\s+)?(code|file|content)\s+(remains?|unchanged|here|omitted)/i,
		/(previous|existing|original)\s+code\s+(remains?|unchanged|here|omitted)/i,
		/code\s+(truncated|omitted|removed|skipped|abbreviated)/i,
		/\[.*\s+(truncated|omitted|removed|skipped)\s*.*\]/i,
		/\/\/\s*\[.*lines?\s+\d+.*\]/i, // e.g., // [lines 50-100 remain unchanged]
		/#\s*\[.*lines?\s+\d+.*\]/i, // Python version
		/<!--\s*\[.*lines?\s+\d+.*\].*-->/i, // HTML version
	]

	// Weaker patterns that need additional context to be considered omissions
	const weakOmissionKeywords = ["remain", "remains", "unchanged", "rest", "previous", "existing", "content", "same"]

	const commentPatterns = [
		/^\s*\/\//, // Single-line comment for most languages
		/^\s*#/, // Single-line comment for Python, Ruby, etc.
		/^\s*\/\*/, // Multi-line comment opening
		/^\s*{\s*\/\*/, // JSX comment opening
		/^\s*<!--/, // HTML comment opening
		/^\s*\[/, // Square bracket notation
	]

	// Check for strong omission patterns first
	for (const line of newLines) {
		// Skip if this line was in the original file
		if (originalLines.includes(line)) {
			continue
		}

		// Check for strong patterns that clearly indicate omissions
		if (strongOmissionPatterns.some((pattern) => pattern.test(line))) {
			return true
		}

		// For weak patterns, require multiple indicators
		if (commentPatterns.some((pattern) => pattern.test(line))) {
			const lowerLine = line.toLowerCase()
			const words = lowerLine.split(/\s+/)

			// Count how many weak keywords are present
			let keywordCount = 0
			for (const keyword of weakOmissionKeywords) {
				if (words.includes(keyword)) {
					keywordCount++
				}
			}

			// Only flag if we have multiple weak keywords together
			// This reduces false positives from single words like "// Add to config"
			if (keywordCount >= 2) {
				// Additional check: look for phrases that indicate actual omission
				// rather than documentation
				const omissionPhrases = [
					/remains?\s+(unchanged|the\s+same|here)/i,
					/rest\s+of\s+(the\s+)?(code|file|content)/i,
					/previous\s+(code|content|implementation)/i,
					/existing\s+(code|content|implementation)/i,
					/content\s+(remains?|unchanged)/i,
				]

				if (omissionPhrases.some((phrase) => phrase.test(lowerLine))) {
					return true
				}
			}
		}
	}

	return false
}
