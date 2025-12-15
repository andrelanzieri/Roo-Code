/**
 * Utility functions for JSON Schema manipulation.
 */

type JsonSchemaObject = Record<string, unknown>

/**
 * Recursively adds `additionalProperties: false` to all object types in a JSON Schema.
 *
 * OpenAI's strict mode function calling requires `additionalProperties: false` on all
 * object types in the schema, including nested objects inside arrays, combinators, etc.
 *
 * @param schema - The JSON Schema object to normalize
 * @returns A new schema with `additionalProperties: false` added to all object types
 */
export function normalizeSchemaForStrictMode(schema: JsonSchemaObject | undefined): JsonSchemaObject | undefined {
	if (!schema || typeof schema !== "object") {
		return schema
	}

	const result: JsonSchemaObject = { ...schema }

	// Add additionalProperties: false to object types with properties
	if (result.type === "object" && result.properties) {
		result.additionalProperties = false

		// Recursively process each property
		const properties = result.properties as Record<string, JsonSchemaObject>
		const normalizedProperties: Record<string, JsonSchemaObject> = {}

		for (const [key, value] of Object.entries(properties)) {
			normalizedProperties[key] = normalizeSchemaForStrictMode(value) ?? {}
		}

		result.properties = normalizedProperties
	}

	// Handle array items
	if (result.items) {
		if (Array.isArray(result.items)) {
			result.items = result.items.map((item) => normalizeSchemaForStrictMode(item as JsonSchemaObject) ?? {})
		} else {
			result.items = normalizeSchemaForStrictMode(result.items as JsonSchemaObject)
		}
	}

	// Handle combinators (anyOf, allOf, oneOf)
	for (const combinator of ["anyOf", "allOf", "oneOf"] as const) {
		const combinatorValue = result[combinator]
		if (Array.isArray(combinatorValue)) {
			result[combinator] = combinatorValue.map(
				(subSchema) => normalizeSchemaForStrictMode(subSchema as JsonSchemaObject) ?? {},
			)
		}
	}

	// Handle conditional schemas (if/then/else)
	if (result.if) {
		result.if = normalizeSchemaForStrictMode(result.if as JsonSchemaObject)
	}
	if (result.then) {
		result.then = normalizeSchemaForStrictMode(result.then as JsonSchemaObject)
	}
	if (result.else) {
		result.else = normalizeSchemaForStrictMode(result.else as JsonSchemaObject)
	}

	// Handle definitions/$defs
	if (result.definitions) {
		const definitions = result.definitions as Record<string, JsonSchemaObject>
		const normalizedDefinitions: Record<string, JsonSchemaObject> = {}

		for (const [key, value] of Object.entries(definitions)) {
			normalizedDefinitions[key] = normalizeSchemaForStrictMode(value) ?? {}
		}

		result.definitions = normalizedDefinitions
	}

	if (result.$defs) {
		const defs = result.$defs as Record<string, JsonSchemaObject>
		const normalizedDefs: Record<string, JsonSchemaObject> = {}

		for (const [key, value] of Object.entries(defs)) {
			normalizedDefs[key] = normalizeSchemaForStrictMode(value) ?? {}
		}

		result.$defs = normalizedDefs
	}

	return result
}
