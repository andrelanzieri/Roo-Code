import { TFunction } from "i18next"

/**
 * Extracts a meaningful title from an error message.
 * This function handles various error formats including MCP errors,
 * file operation errors, and other structured error messages.
 */
export function extractErrorTitle(errorContent: string, t: TFunction): string {
	// Default fallback title
	const defaultTitle = t("chat:error")

	if (!errorContent || typeof errorContent !== "string") {
		return defaultTitle
	}

	// Clean up the error content
	const trimmedContent = errorContent.trim()

	// Define the type for error patterns
	type ErrorPattern = {
		pattern: RegExp
		title?: string
		extractTitle?: boolean
		prefix?: string
	}

	// MCP-specific error patterns with their corresponding titles
	const mcpErrorPatterns: ErrorPattern[] = [
		{
			pattern: /Invalid MCP settings JSON format.*Please ensure your settings follow the correct JSON format/i,
			title: "Invalid MCP Settings Format",
		},
		{
			pattern: /Invalid MCP settings JSON format.*Please check your settings file for syntax errors/i,
			title: "Invalid MCP Settings Syntax",
		},
		{
			pattern: /Invalid MCP settings format:/i,
			title: "Invalid MCP Settings Validation",
		},
		{
			pattern: /Failed to create or open \.roo\/mcp\.json:/i,
			title: "MCP Configuration File Error",
		},
		{
			pattern: /Failed to update project MCP servers/i,
			title: "MCP Server Update Failed",
		},
		{
			pattern: /Roo tried to use .+ with an invalid JSON argument/i,
			title: "Invalid Tool Arguments",
		},
	]

	// File operation error patterns
	const fileErrorPatterns: ErrorPattern[] = [
		{
			pattern: /^Error reading file:.*?(File not found):/i,
			title: "File Not Found",
		},
		{
			pattern: /^Error reading file:.*?(Permission denied):/i,
			title: "Permission Denied",
		},
		{
			pattern: /^Error reading file:\s*(.+?)(?::|$)/i,
			extractTitle: true,
			prefix: "File Read Error",
		},
		{
			pattern: /^File does not exist at path:/i,
			title: "File Does Not Exist",
		},
		{
			pattern: /^Cannot insert content at line \d+ into a non-existent file/i,
			title: "Cannot Insert Into Non-Existent File",
		},
		{
			pattern: /^Failed to parse operations:/i,
			title: "Invalid Operations Format",
		},
		{
			pattern: /^Failed to parse apply_diff XML:/i,
			title: "Invalid Diff Format",
		},
	]

	// Tool-specific error patterns
	const toolErrorPatterns: ErrorPattern[] = [
		{
			pattern: /^Failed to execute command:/i,
			title: "Command Execution Failed",
		},
		{
			pattern: /^Command execution timed out/i,
			title: "Command Timeout",
		},
		{
			pattern: /^Search and replace operation failed:/i,
			title: "Search & Replace Failed",
		},
		{
			pattern: /^Failed to apply diff:/i,
			title: "Diff Application Failed",
		},
		// Roo chat errors generated when tool args are missing/invalid
		{
			// Example: Roo tried to use apply_diff without value for required parameter 'path'. Retrying...
			pattern: /^Roo tried to use .+ without value for required parameter ['"“”‘’][^'"“”‘’]+['"“”‘’]/i,
			title: "Missing Required Parameter",
		},
		{
			// Fallback without quoting the param
			pattern: /^Roo tried to use .+ without value for required parameter/i,
			title: "Missing Required Parameter",
		},
	]

	// API and service error patterns
	const apiErrorPatterns: ErrorPattern[] = [
		{
			pattern: /^Authentication failed/i,
			title: "Authentication Failed",
		},
		{
			pattern: /^API rate limit exceeded/i,
			title: "Rate Limit Exceeded",
		},
		{
			pattern: /^API key.*mismatch/i,
			title: "API Key Mismatch",
		},
		{
			pattern: /^Service unavailable/i,
			title: "Service Unavailable",
		},
		{
			pattern: /^Network error/i,
			title: "Network Error",
		},
		{
			pattern: /^Connection failed/i,
			title: "Connection Failed",
		},
	]

	// Embeddings and indexing error patterns
	const embeddingErrorPatterns: ErrorPattern[] = [
		{
			pattern: /^Failed to create embeddings:/i,
			title: "Embeddings Creation Failed",
		},
		{
			pattern: /^Vector dimension mismatch/i,
			title: "Vector Dimension Mismatch",
		},
		{
			pattern: /^Failed to connect to Qdrant/i,
			title: "Qdrant Connection Failed",
		},
		{
			pattern: /^Indexing requires an open workspace/i,
			title: "Workspace Required for Indexing",
		},
	]

	// Combine all pattern groups
	const allPatterns = [
		...mcpErrorPatterns,
		...fileErrorPatterns,
		...toolErrorPatterns,
		...apiErrorPatterns,
		...embeddingErrorPatterns,
	]

	// Try to match against specific patterns first
	for (const pattern of allPatterns) {
		const match = trimmedContent.match(pattern.pattern)
		if (match) {
			if (pattern.title) {
				return pattern.title
			} else if (pattern.extractTitle && match[1]) {
				// Extract and clean up the title from the match
				let extracted = match[1].trim()
				// Remove redundant "Error" prefix if present
				extracted = extracted.replace(/^Error\s+/i, "").trim()
				// Apply prefix if specified
				if (pattern.prefix && extracted) {
					return `${pattern.prefix}: ${extracted}`
				}
				// Only use extracted title if it's reasonable length
				if (extracted.length > 0 && extracted.length <= 50) {
					return extracted
				}
			}
		}
	}

	// Generic patterns for common error formats
	const genericPatterns = [
		// "Error: Title - rest of message" or "Error: Title: rest" pattern
		// This should be checked first to handle "Error:" prefix specially
		// Use non-greedy match to stop at first colon or dash
		{
			regex: /^Error:\s*([^-:]{3,50}?)(?:[-:]|$)/i,
			extractTitle: true,
		},
		// "[ERROR] Title" pattern
		{
			regex: /^\[ERROR\]\s*([^:]{3,50})/i,
			extractTitle: true,
		},
		// Generic "Title: rest of message" pattern (checked last)
		{
			regex: /^([^:]{3,50}):\s*/,
			extractTitle: true,
		},
	]

	// Try generic patterns
	for (const pattern of genericPatterns) {
		const match = trimmedContent.match(pattern.regex)
		if (match && pattern.extractTitle && match[1]) {
			let extracted = match[1].trim()
			// Remove redundant "Error" prefix
			extracted = extracted.replace(/^Error\s+/i, "").trim()
			// Capitalize first letter
			if (extracted.length > 0) {
				extracted = extracted.charAt(0).toUpperCase() + extracted.slice(1)
				return extracted
			}
		}
	}

	// If the error message is short enough, use it as the title
	// (but clean it up first)
	if (trimmedContent.length <= 50) {
		// Remove common prefixes
		let cleaned = trimmedContent
			.replace(/^Error:\s*/i, "")
			.replace(/^Failed:\s*/i, "")
			.replace(/^Warning:\s*/i, "")
			.trim()

		// Capitalize first letter
		if (cleaned.length > 0) {
			cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
			// If it ends with a period, remove it for the title
			cleaned = cleaned.replace(/\.$/, "")
			return cleaned
		}
	}

	// Check if it's a known error type from the message structure
	// This handles cases where the error might be a key from i18n
	const knownErrorKeys = [
		"invalid_settings_format",
		"invalid_settings_syntax",
		"invalid_settings_validation",
		"create_json",
		"failed_update_project",
		"invalidJsonArgument",
	]

	for (const key of knownErrorKeys) {
		if (trimmedContent.includes(key)) {
			// Convert snake_case to Title Case
			const title = key
				.split("_")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ")
			return title
		}
	}

	// Default fallback
	return defaultTitle
}
