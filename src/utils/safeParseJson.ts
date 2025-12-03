import { parseJSON } from "partial-json"

/**
 * Replace raw TAB characters inside JSON string literals with \t
 * without touching anything outside of quoted strings.
 */
function repairTabsInsideJsonStrings(rawJson: string): string {
	return rawJson.replace(
		/"(?:[^"\\]|\\.)*"/g, // match JSON string literals
		(str) => str.replace(/\t/g, "\\t"),
	)
}

export type SafeParseResult<T> =
	| {
			ok: true
			value: T
			repaired: boolean
			source: string // the JSON text that was successfully parsed
	  }
	| {
			ok: false
			error: Error
			repaired: boolean
			source: string // last JSON text we attempted to parse
	  }

/**
 * Safely parse JSON that may contain raw TAB characters inside string values.
 * - First tries JSON.parse(rawJson) for strict validation
 * - If that fails, repairs raw tabs *inside strings* and tries again with parseJSON
 *   (which is more lenient with incomplete JSON from streaming)
 */
export function safeParsePossiblyTabCorruptedJson<T = unknown>(rawJson: string): SafeParseResult<T> {
	// First attempt: strict parse to detect invalid JSON
	try {
		const value = JSON.parse(rawJson) as T
		return {
			ok: true,
			value,
			repaired: false,
			source: rawJson,
		}
	} catch (originalError) {
		// Second attempt: repair tabs *inside* string literals and use lenient parser
		const repairedSource = repairTabsInsideJsonStrings(rawJson)

		// If nothing changed, don't bother retrying
		if (repairedSource === rawJson) {
			return {
				ok: false,
				error: originalError as Error,
				repaired: false,
				source: rawJson,
			}
		}

		try {
			// Use parseJSON for extra leniency with the repaired source
			const value = parseJSON(repairedSource) as T
			return {
				ok: true,
				value,
				repaired: true,
				source: repairedSource,
			}
		} catch (repairedError) {
			const combined = new Error(
				`Failed to parse JSON even after repairing tabs.\n` +
					`Original error: ${(originalError as Error).message}\n` +
					`After repair: ${(repairedError as Error).message}`,
			)
			return {
				ok: false,
				error: combined,
				repaired: true,
				source: repairedSource,
			}
		}
	}
}
