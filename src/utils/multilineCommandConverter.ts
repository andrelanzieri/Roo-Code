/**
 * Utility to convert multiline terminal commands into single-line equivalents
 * to prevent terminal hanging issues when executing multiline commands.
 *
 * Supports POSIX shells (bash, zsh, fish) and PowerShell.
 */

export interface ConversionResult {
	success: boolean
	command: string
	reason?: string
}

/**
 * Detects if a command contains a Here Document which cannot be converted to single line
 */
function hasHereDocument(command: string): boolean {
	// Check for Here Document patterns: <<EOF, <<-EOF, <<"EOF", <<'EOF'
	const hereDocPattern = /<<-?\s*(['"]?)(\w+)\1/
	return hereDocPattern.test(command)
}

/**
 * Main function to convert multiline commands to single line
 * Uses a simple approach: join lines with semicolons for most cases
 */
export function convertMultilineToSingleLine(command: string): ConversionResult {
	// Check if command is already single line
	if (!command.includes("\n")) {
		return { success: true, command }
	}

	// Check for unconvertible patterns
	if (hasHereDocument(command)) {
		return {
			success: false,
			command,
			reason: "Command contains a Here Document which cannot be converted to single line",
		}
	}

	try {
		// Simple approach: handle common patterns
		let result = command

		// Handle line continuations (backslash at end of line)
		result = result.replace(/\\\n\s*/g, " ")

		// Handle line continuations (backtick at end of line for PowerShell)
		result = result.replace(/`\n\s*/g, " ")

		// Split into lines
		const lines = result
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line)

		// Join lines with appropriate separators
		const joined = lines.join(" ; ")

		// Clean up multiple semicolons and spaces
		result = joined
			.replace(/;\s*;/g, ";")
			.replace(/\s+/g, " ")
			.replace(/\{\s*;/g, "{") // Remove semicolon after opening brace
			.replace(/\(\s*;/g, "(") // Remove semicolon after opening paren
			.replace(/\|\s*;/g, "|") // Remove semicolon after pipe
			.replace(/&&\s*;/g, "&&") // Remove semicolon after &&
			.replace(/\|\|\s*;/g, "||") // Remove semicolon after ||
			.trim()

		return { success: true, command: result }
	} catch (error) {
		// If conversion fails, return original command
		return {
			success: false,
			command,
			reason: `Conversion failed: ${error.message}`,
		}
	}
}

/**
 * Determines if a command should be converted based on configuration
 */
export function shouldConvertCommand(command: string): boolean {
	// Always convert if command has multiple lines
	if (!command.includes("\n")) {
		return false
	}

	// Check for patterns that should not be converted
	if (hasHereDocument(command)) {
		return false
	}

	return true
}
