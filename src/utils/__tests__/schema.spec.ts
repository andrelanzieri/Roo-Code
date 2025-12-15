import { normalizeSchemaForStrictMode } from "../schema"

describe("normalizeSchemaForStrictMode", () => {
	it("should return undefined for undefined input", () => {
		expect(normalizeSchemaForStrictMode(undefined)).toBeUndefined()
	})

	it("should return non-object values unchanged", () => {
		expect(normalizeSchemaForStrictMode(null as any)).toBeNull()
		expect(normalizeSchemaForStrictMode("string" as any)).toBe("string")
	})

	it("should add additionalProperties: false to object types with properties", () => {
		const schema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect(result?.additionalProperties).toBe(false)
		expect(result?.properties).toEqual({ name: { type: "string" } })
	})

	it("should not add additionalProperties to object types without properties", () => {
		const schema = {
			type: "object",
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect(result?.additionalProperties).toBeUndefined()
	})

	it("should recursively process nested object properties", () => {
		const schema = {
			type: "object",
			properties: {
				nested: {
					type: "object",
					properties: {
						value: { type: "string" },
					},
				},
			},
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect(result?.additionalProperties).toBe(false)
		const nestedSchema = result?.properties as Record<string, any>
		expect(nestedSchema.nested.additionalProperties).toBe(false)
	})

	it("should process object types inside array items", () => {
		const schema = {
			type: "array",
			items: {
				type: "object",
				properties: {
					name: { type: "string" },
				},
			},
		}

		const result = normalizeSchemaForStrictMode(schema)

		const itemsSchema = result?.items as Record<string, any>
		expect(itemsSchema.additionalProperties).toBe(false)
	})

	it("should process array items when items is an array (tuple validation)", () => {
		const schema = {
			type: "array",
			items: [
				{
					type: "object",
					properties: {
						first: { type: "string" },
					},
				},
				{
					type: "object",
					properties: {
						second: { type: "number" },
					},
				},
			],
		}

		const result = normalizeSchemaForStrictMode(schema)

		const itemsArray = result?.items as Record<string, any>[]
		expect(itemsArray[0].additionalProperties).toBe(false)
		expect(itemsArray[1].additionalProperties).toBe(false)
	})

	it("should process anyOf, allOf, and oneOf combinators", () => {
		const schema = {
			anyOf: [{ type: "object", properties: { a: { type: "string" } } }],
			allOf: [{ type: "object", properties: { b: { type: "string" } } }],
			oneOf: [{ type: "object", properties: { c: { type: "string" } } }],
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect((result?.anyOf as any[])[0].additionalProperties).toBe(false)
		expect((result?.allOf as any[])[0].additionalProperties).toBe(false)
		expect((result?.oneOf as any[])[0].additionalProperties).toBe(false)
	})

	it("should process conditional schemas (if/then/else)", () => {
		const schema = {
			if: { type: "object", properties: { condition: { type: "boolean" } } },
			then: { type: "object", properties: { thenValue: { type: "string" } } },
			else: { type: "object", properties: { elseValue: { type: "string" } } },
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect((result?.if as any).additionalProperties).toBe(false)
		expect((result?.then as any).additionalProperties).toBe(false)
		expect((result?.else as any).additionalProperties).toBe(false)
	})

	it("should process definitions and $defs", () => {
		const schema = {
			definitions: {
				Entity: { type: "object", properties: { id: { type: "string" } } },
			},
			$defs: {
				Item: { type: "object", properties: { name: { type: "string" } } },
			},
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect((result?.definitions as any).Entity.additionalProperties).toBe(false)
		expect((result?.$defs as any).Item.additionalProperties).toBe(false)
	})

	it("should handle complex nested schema like MCP memory create_entities", () => {
		// This is a schema similar to what caused the original error
		const schema = {
			type: "object",
			properties: {
				entities: {
					type: "array",
					items: {
						type: "object",
						properties: {
							name: { type: "string" },
							entityType: { type: "string" },
							observations: {
								type: "array",
								items: { type: "string" },
							},
						},
						required: ["name", "entityType", "observations"],
					},
				},
			},
			required: ["entities"],
		}

		const result = normalizeSchemaForStrictMode(schema)

		// Top level should have additionalProperties: false
		expect(result?.additionalProperties).toBe(false)

		// The object inside the array items should also have additionalProperties: false
		const propertiesSchema = result?.properties as Record<string, any>
		expect(propertiesSchema.entities.items.additionalProperties).toBe(false)

		// Required arrays should be preserved
		expect(result?.required).toEqual(["entities"])
		expect(propertiesSchema.entities.items.required).toEqual(["name", "entityType", "observations"])
	})

	it("should not mutate the original schema", () => {
		const original = {
			type: "object",
			properties: {
				nested: {
					type: "object",
					properties: {
						value: { type: "string" },
					},
				},
			},
		}
		const originalJson = JSON.stringify(original)

		normalizeSchemaForStrictMode(original)

		expect(JSON.stringify(original)).toBe(originalJson)
	})

	it("should preserve non-object properties", () => {
		const schema = {
			type: "object",
			properties: {
				name: { type: "string", description: "The name", minLength: 1 },
				age: { type: "integer", minimum: 0, maximum: 150 },
			},
			required: ["name"],
		}

		const result = normalizeSchemaForStrictMode(schema)

		expect(result?.additionalProperties).toBe(false)
		const props = result?.properties as Record<string, any>
		expect(props.name.description).toBe("The name")
		expect(props.name.minLength).toBe(1)
		expect(props.age.minimum).toBe(0)
		expect(props.age.maximum).toBe(150)
		expect(result?.required).toEqual(["name"])
	})
})
