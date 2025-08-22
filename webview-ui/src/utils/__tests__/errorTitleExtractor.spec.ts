import { describe, it, expect, vi } from "vitest"
import { extractErrorTitle } from "../errorTitleExtractor"

// Mock the translation function with proper typing
const mockT = vi.fn((key: string) => {
	if (key === "chat:error") return "Error"
	return key
}) as any // Cast to any to bypass TFunction type checking in tests

describe("extractErrorTitle", () => {
	describe("MCP Error Patterns", () => {
		it("should extract title for invalid MCP settings format", () => {
			const error =
				"Invalid MCP settings JSON format. Please ensure your settings follow the correct JSON format."
			expect(extractErrorTitle(error, mockT)).toBe("Invalid MCP Settings Format")
		})

		it("should extract title for invalid MCP settings syntax", () => {
			const error = "Invalid MCP settings JSON format. Please check your settings file for syntax errors."
			expect(extractErrorTitle(error, mockT)).toBe("Invalid MCP Settings Syntax")
		})

		it("should extract title for MCP settings validation error", () => {
			const error = "Invalid MCP settings format: missing required field 'command'"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid MCP Settings Validation")
		})

		it("should extract title for MCP configuration file error", () => {
			const error = "Failed to create or open .roo/mcp.json: Permission denied"
			expect(extractErrorTitle(error, mockT)).toBe("MCP Configuration File Error")
		})

		it("should extract title for MCP server update failure", () => {
			const error = "Failed to update project MCP servers"
			expect(extractErrorTitle(error, mockT)).toBe("MCP Server Update Failed")
		})

		it("should extract title for invalid tool arguments", () => {
			const error = "Roo tried to use apply_diff with an invalid JSON argument. Retrying..."
			expect(extractErrorTitle(error, mockT)).toBe("Invalid Tool Arguments")
		})
	})

	describe("File Operation Error Patterns", () => {
		it("should extract title for file not found error", () => {
			const error = "Error reading file: File not found: /path/to/file.txt"
			expect(extractErrorTitle(error, mockT)).toBe("File Not Found")
		})

		it("should extract title for permission denied error", () => {
			const error = "Error reading file: Permission denied: /path/to/file.txt"
			expect(extractErrorTitle(error, mockT)).toBe("Permission Denied")
		})

		it("should extract title for generic file read error", () => {
			const error = "Error reading file: Disk full"
			expect(extractErrorTitle(error, mockT)).toBe("File Read Error: Disk full")
		})

		it("should extract title for file does not exist error", () => {
			const error = "File does not exist at path: /path/to/file.txt"
			expect(extractErrorTitle(error, mockT)).toBe("File Does Not Exist")
		})

		it("should extract title for insert into non-existent file error", () => {
			const error =
				"Cannot insert content at line 10 into a non-existent file. For new files, 'line' must be 0 (to append) or 1 (to insert at the beginning)."
			expect(extractErrorTitle(error, mockT)).toBe("Cannot Insert Into Non-Existent File")
		})

		it("should extract title for parse operations error", () => {
			const error = "Failed to parse operations: Invalid XML format"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid Operations Format")
		})

		it("should extract title for parse diff error", () => {
			const error = "Failed to parse apply_diff XML: Unexpected token"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid Diff Format")
		})
	})

	describe("Tool-specific Error Patterns", () => {
		it("should extract title for command execution failure", () => {
			const error = "Failed to execute command: npm install"
			expect(extractErrorTitle(error, mockT)).toBe("Command Execution Failed")
		})

		it("should extract title for command timeout", () => {
			const error = "Command execution timed out after 30 seconds"
			expect(extractErrorTitle(error, mockT)).toBe("Command Timeout")
		})

		it("should extract title for search and replace failure", () => {
			const error = "Search and replace operation failed: Pattern not found"
			expect(extractErrorTitle(error, mockT)).toBe("Search & Replace Failed")
		})

		it("should extract title for diff application failure", () => {
			const error = "Failed to apply diff: Merge conflict"
			expect(extractErrorTitle(error, mockT)).toBe("Diff Application Failed")
		})
	})

	describe("API and Service Error Patterns", () => {
		it("should extract title for authentication failure", () => {
			const error = "Authentication failed. Please check your API key."
			expect(extractErrorTitle(error, mockT)).toBe("Authentication Failed")
		})

		it("should extract title for rate limit error", () => {
			const error = "API rate limit exceeded. Please wait before making another request."
			expect(extractErrorTitle(error, mockT)).toBe("Rate Limit Exceeded")
		})

		it("should extract title for API key mismatch", () => {
			const error = "API key and subscription plan mismatch"
			expect(extractErrorTitle(error, mockT)).toBe("API Key Mismatch")
		})

		it("should extract title for service unavailable", () => {
			const error = "Service unavailable. Please try again later."
			expect(extractErrorTitle(error, mockT)).toBe("Service Unavailable")
		})

		it("should extract title for network error", () => {
			const error = "Network error: Unable to connect to server"
			expect(extractErrorTitle(error, mockT)).toBe("Network Error")
		})

		it("should extract title for connection failure", () => {
			const error = "Connection failed: Timeout"
			expect(extractErrorTitle(error, mockT)).toBe("Connection Failed")
		})
	})

	describe("Embeddings and Indexing Error Patterns", () => {
		it("should extract title for embeddings creation failure", () => {
			const error = "Failed to create embeddings: Model not available"
			expect(extractErrorTitle(error, mockT)).toBe("Embeddings Creation Failed")
		})

		it("should extract title for vector dimension mismatch", () => {
			const error = "Vector dimension mismatch. Expected 1536, got 768"
			expect(extractErrorTitle(error, mockT)).toBe("Vector Dimension Mismatch")
		})

		it("should extract title for Qdrant connection failure", () => {
			const error = "Failed to connect to Qdrant vector database"
			expect(extractErrorTitle(error, mockT)).toBe("Qdrant Connection Failed")
		})

		it("should extract title for workspace requirement", () => {
			const error = "Indexing requires an open workspace folder"
			expect(extractErrorTitle(error, mockT)).toBe("Workspace Required for Indexing")
		})
	})

	describe("Generic Error Patterns", () => {
		it("should extract title from colon-separated format", () => {
			const error = "Database Error: Connection lost"
			expect(extractErrorTitle(error, mockT)).toBe("Database Error")
		})

		it("should extract title from Error: prefix format", () => {
			const error = "Error: Invalid configuration - missing required fields"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid configuration")
		})

		it("should extract title from [ERROR] prefix format", () => {
			const error = "[ERROR] Configuration not found"
			expect(extractErrorTitle(error, mockT)).toBe("Configuration not found")
		})

		it("should use short error message as title", () => {
			const error = "Invalid input"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid input")
		})

		it("should capitalize first letter of extracted title", () => {
			const error = "validation failed"
			expect(extractErrorTitle(error, mockT)).toBe("Validation failed")
		})

		it("should remove trailing period from title", () => {
			const error = "Operation completed with errors."
			expect(extractErrorTitle(error, mockT)).toBe("Operation completed with errors")
		})
	})

	describe("Edge Cases", () => {
		it("should return default title for empty string", () => {
			expect(extractErrorTitle("", mockT)).toBe("Error")
		})

		it("should return default title for null", () => {
			expect(extractErrorTitle(null as any, mockT)).toBe("Error")
		})

		it("should return default title for undefined", () => {
			expect(extractErrorTitle(undefined as any, mockT)).toBe("Error")
		})

		it("should return default title for non-string input", () => {
			expect(extractErrorTitle(123 as any, mockT)).toBe("Error")
		})

		it("should handle very long error messages", () => {
			const longError =
				"This is a very long error message that exceeds the maximum length for a title and should fall back to the default error title instead of using the entire message as the title"
			expect(extractErrorTitle(longError, mockT)).toBe("Error")
		})

		it("should handle error messages with only whitespace", () => {
			expect(extractErrorTitle("   \n\t  ", mockT)).toBe("Error")
		})

		it("should convert snake_case error keys to Title Case", () => {
			const error = "Something went wrong with invalid_settings_format in the system"
			expect(extractErrorTitle(error, mockT)).toBe("Invalid Settings Format")
		})
	})

	describe("Real-world Examples", () => {
		it("should handle MCP tool error from actual code", () => {
			const error = "Roo tried to use apply_diff with an invalid JSON argument. Retrying..."
			expect(extractErrorTitle(error, mockT)).toBe("Invalid Tool Arguments")
		})

		it("should handle missing required parameter tool error", () => {
			const error = "Roo tried to use apply_diff without value for required parameter 'path'. Retrying..."
			expect(extractErrorTitle(error, mockT)).toBe("Missing Required Parameter")
		})

		it("should handle file not found error from actual code", () => {
			const error =
				"File does not exist at path: /Users/test/project/src/app.ts\n\n<error_details>\nThe specified file could not be found. Please verify the file path and try again.\n</error_details>"
			expect(extractErrorTitle(error, mockT)).toBe("File Does Not Exist")
		})

		it("should handle complex error with multiple colons", () => {
			const error = "Error: Failed to process: Invalid JSON: Unexpected token"
			expect(extractErrorTitle(error, mockT)).toBe("Failed to process")
		})

		it("should handle error with HTML/XML tags", () => {
			const error = "Error reading file: <permission_denied>Access denied</permission_denied>"
			expect(extractErrorTitle(error, mockT)).toBe(
				"File Read Error: <permission_denied>Access denied</permission_denied>",
			)
		})
	})
})
