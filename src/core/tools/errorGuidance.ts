/**
 * Error guidance system for providing contextual help when models struggle with tool usage
 */

import { ToolName } from "@roo-code/types"

export interface ToolErrorPattern {
	toolName: ToolName
	errorType: "missing_param" | "invalid_format" | "file_not_found" | "permission_denied" | "repeated_failure"
	count: number
	lastError?: string
}

export interface GuidanceContext {
	recentTools: ToolName[]
	errorPatterns: ToolErrorPattern[]
	consecutiveMistakeCount: number
	lastToolUsed?: ToolName
}

/**
 * Analyzes tool usage patterns and generates contextual guidance
 */
export class ToolErrorGuidance {
	private static readonly GUIDANCE_TEMPLATES = {
		// General guidance for different scenarios
		general_breakdown: [
			"Try breaking down the task into smaller, more manageable steps.",
			"Consider completing one part of the task at a time before moving to the next.",
			"Focus on a single file or component before expanding to others.",
		],

		file_operations: [
			"Double-check file paths and ensure files exist before attempting operations.",
			"Use 'list_files' to verify the directory structure first.",
			"Consider using 'read_file' to examine the current content before making changes.",
		],

		missing_parameters: [
			"Review the tool parameters carefully - ensure all required fields are provided.",
			"Check that parameter values are in the correct format (e.g., paths, line numbers).",
			"Use simpler values first to test if the tool works, then add complexity.",
		],

		code_modifications: [
			"Read the file first to understand its current structure.",
			"Make smaller, targeted changes rather than large rewrites.",
			"Use 'apply_diff' for precise edits instead of rewriting entire files.",
			"Verify your changes by reading the file after modifications.",
		],

		search_operations: [
			"Start with broader search patterns, then refine them.",
			"Use 'list_files' to understand the project structure before searching.",
			"Try searching in specific directories rather than the entire project.",
		],

		command_execution: [
			"Verify the command syntax is correct for the operating system.",
			"Check if required tools or dependencies are installed.",
			"Start with simple commands to test the environment.",
			"Consider the working directory when running commands.",
		],

		permission_issues: [
			"Check if the file or directory has the necessary permissions.",
			"Verify you're operating in the correct workspace.",
			"Some files may be protected - check the error message for details.",
		],
	}

	/**
	 * Analyzes the context and returns appropriate guidance messages
	 */
	public static getContextualGuidance(context: GuidanceContext): string[] {
		const guidance: string[] = []

		// Analyze patterns to determine the type of struggle
		const hasFileErrors = context.errorPatterns.some(
			(p) => p.errorType === "file_not_found" || p.toolName === "read_file" || p.toolName === "write_to_file",
		)

		const hasMissingParams = context.errorPatterns.some((p) => p.errorType === "missing_param")

		const hasPermissionIssues = context.errorPatterns.some((p) => p.errorType === "permission_denied")

		const hasRepeatedFailures = context.errorPatterns.some((p) => p.count >= 2)

		const hasSearchIssues =
			context.recentTools.filter((t) => t === "search_files" || t === "list_files").length >= 2

		const hasCodeModificationIssues =
			context.recentTools.filter((t) => t === "apply_diff" || t === "write_to_file" || t === "insert_content")
				.length >= 2

		// Provide targeted guidance based on patterns
		if (hasRepeatedFailures) {
			guidance.push(...this.GUIDANCE_TEMPLATES.general_breakdown)
		}

		if (hasFileErrors) {
			guidance.push(...this.GUIDANCE_TEMPLATES.file_operations)
		}

		if (hasMissingParams) {
			guidance.push(...this.GUIDANCE_TEMPLATES.missing_parameters)
		}

		if (hasPermissionIssues) {
			guidance.push(...this.GUIDANCE_TEMPLATES.permission_issues)
		}

		if (hasSearchIssues) {
			guidance.push(...this.GUIDANCE_TEMPLATES.search_operations)
		}

		if (hasCodeModificationIssues) {
			guidance.push(...this.GUIDANCE_TEMPLATES.code_modifications)
		}

		// If no specific pattern detected, provide general guidance
		if (guidance.length === 0) {
			guidance.push(...this.GUIDANCE_TEMPLATES.general_breakdown)
		}

		// Return unique guidance messages (remove duplicates)
		return [...new Set(guidance)].slice(0, 3) // Limit to 3 most relevant suggestions
	}

	/**
	 * Formats guidance messages into a user-friendly string
	 */
	public static formatGuidanceMessage(guidance: string[]): string {
		if (guidance.length === 0) {
			return "This may indicate a failure in the model's thought process. Try breaking down the task into smaller steps."
		}

		const header = "The model seems to be struggling with tool usage. Here are some suggestions:\n\n"
		const formattedGuidance = guidance.map((g, i) => `${i + 1}. ${g}`).join("\n")

		return header + formattedGuidance
	}

	/**
	 * Analyzes recent tool usage to build error patterns
	 */
	public static buildErrorPatterns(
		recentTools: ToolName[],
		toolErrors: Map<ToolName, { count: number; lastError?: string }>,
	): ToolErrorPattern[] {
		const patterns: ToolErrorPattern[] = []

		for (const [toolName, errorInfo] of toolErrors.entries()) {
			if (errorInfo.count > 0) {
				// Try to determine error type from the error message
				let errorType: ToolErrorPattern["errorType"] = "repeated_failure"

				if (errorInfo.lastError) {
					const errorLower = errorInfo.lastError.toLowerCase()
					if (errorLower.includes("missing") || errorLower.includes("required parameter")) {
						errorType = "missing_param"
					} else if (
						errorLower.includes("not found") ||
						errorLower.includes("does not exist") ||
						errorLower.includes("enoent") ||
						errorLower.includes("no such file")
					) {
						errorType = "file_not_found"
					} else if (errorLower.includes("permission") || errorLower.includes("access denied")) {
						errorType = "permission_denied"
					} else if (errorLower.includes("format") || errorLower.includes("invalid")) {
						errorType = "invalid_format"
					}
				}

				patterns.push({
					toolName,
					errorType,
					count: errorInfo.count,
					lastError: errorInfo.lastError,
				})
			}
		}

		return patterns
	}
}
