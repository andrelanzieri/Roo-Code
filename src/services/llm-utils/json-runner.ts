import { z } from "zod"

/**
 * Handles JSON extraction, validation, and sanitization for LLM responses
 */
export class JsonRunner {
	/**
	 * Extract and validate JSON from LLM response
	 */
	static extract<T>(text: string, schema?: z.ZodSchema<T>): T {
		// Strip markdown fences
		const stripped = this.stripFences(text)

		// Find first JSON object/array
		const json = this.findFirstJson(stripped)

		if (!json) {
			throw new Error("No valid JSON found in response")
		}

		// Parse JSON
		let parsed: any
		try {
			parsed = JSON.parse(json)
		} catch (error) {
			throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
		}

		// Validate with schema if provided
		if (schema) {
			const result = schema.safeParse(parsed)
			if (!result.success) {
				throw new Error(`Schema validation failed: ${result.error.message}`)
			}
			return result.data
		}

		return parsed as T
	}

	/**
	 * Strip markdown code fences from text
	 */
	private static stripFences(text: string): string {
		// Remove ```json ... ``` or ``` ... ```
		const fencePattern = /```(?:json)?\s*([\s\S]*?)```/g
		const matches = [...text.matchAll(fencePattern)]

		if (matches.length > 0) {
			// Return content from first fence
			return matches[0][1].trim()
		}

		return text.trim()
	}

	/**
	 * Find first complete JSON object or array in text
	 */
	private static findFirstJson(text: string): string | null {
		const trimmed = text.trim()

		// Try to find JSON object or array
		const objectStart = trimmed.indexOf("{")
		const arrayStart = trimmed.indexOf("[")

		if (objectStart === -1 && arrayStart === -1) {
			// No JSON markers found
			return null
		}

		// Determine which comes first
		let start: number
		let openChar: string
		let closeChar: string

		if (objectStart !== -1 && (arrayStart === -1 || objectStart < arrayStart)) {
			start = objectStart
			openChar = "{"
			closeChar = "}"
		} else {
			start = arrayStart
			openChar = "["
			closeChar = "]"
		}

		// Extract JSON using bracket counting
		return this.extractJsonByBrackets(trimmed, start, openChar, closeChar)
	}

	/**
	 * Extract JSON by counting brackets
	 */
	private static extractJsonByBrackets(
		text: string,
		start: number,
		openChar: string,
		closeChar: string,
	): string | null {
		let depth = 0
		let inString = false
		let escape = false

		for (let i = start; i < text.length; i++) {
			const char = text[i]

			// Handle escape sequences
			if (escape) {
				escape = false
				continue
			}

			if (char === "\\") {
				escape = true
				continue
			}

			// Handle strings
			if (char === '"' && !escape) {
				inString = !inString
				continue
			}

			// Count brackets only outside strings
			if (!inString) {
				if (char === openChar) {
					depth++
				} else if (char === closeChar) {
					depth--
					if (depth === 0) {
						return text.substring(start, i + 1)
					}
				}
			}
		}

		// No complete JSON found
		return null
	}

	/**
	 * Sanitize JSON for logging (remove sensitive data)
	 */
	static sanitize(obj: any, sensitiveKeys: string[] = []): any {
		const defaultSensitiveKeys = ["apiKey", "api_key", "token", "secret", "password", "credential", "auth"]

		const allSensitiveKeys = [...defaultSensitiveKeys, ...sensitiveKeys]

		if (obj === null || obj === undefined) {
			return obj
		}

		if (typeof obj !== "object") {
			return obj
		}

		if (Array.isArray(obj)) {
			return obj.map((item) => this.sanitize(item, sensitiveKeys))
		}

		const sanitized: any = {}
		for (const [key, value] of Object.entries(obj)) {
			const lowerKey = key.toLowerCase()
			const isSensitive = allSensitiveKeys.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))

			if (isSensitive) {
				sanitized[key] = "[REDACTED]"
			} else if (typeof value === "object" && value !== null) {
				sanitized[key] = this.sanitize(value, sensitiveKeys)
			} else {
				sanitized[key] = value
			}
		}

		return sanitized
	}

	/**
	 * Validate JSON against a Zod schema with detailed error reporting
	 */
	static validate<T>(
		data: unknown,
		schema: z.ZodSchema<T>,
	): { success: true; data: T } | { success: false; errors: string[] } {
		const result = schema.safeParse(data)

		if (result.success) {
			return { success: true, data: result.data }
		}

		// Extract detailed error messages
		const errors = result.error.errors.map((err) => {
			const path = err.path.join(".")
			return path ? `${path}: ${err.message}` : err.message
		})

		return { success: false, errors }
	}
}
