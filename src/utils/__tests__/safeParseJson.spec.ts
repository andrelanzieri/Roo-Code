import { safeParsePossiblyTabCorruptedJson, type SafeParseResult } from "../safeParseJson"

describe("safeParsePossiblyTabCorruptedJson", () => {
	describe("valid JSON without tabs", () => {
		it("should parse valid JSON successfully", () => {
			const input = '{"name":"test","value":123}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ name: "test", value: 123 })
				expect(result.repaired).toBe(false)
				expect(result.source).toBe(input)
			}
		})

		it("should handle escaped tabs in strings without repair", () => {
			const input = '{"content":"line1\\tline2"}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ content: "line1\tline2" })
				expect(result.repaired).toBe(false)
			}
		})

		it("should parse arrays correctly", () => {
			const input = '["a","b","c"]'
			const result = safeParsePossiblyTabCorruptedJson<string[]>(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual(["a", "b", "c"])
				expect(result.repaired).toBe(false)
			}
		})
	})

	describe("JSON with raw tabs inside strings", () => {
		it("should repair and parse JSON with raw tab in string value", () => {
			// This JSON has a raw tab character inside the string value
			const input = '{"content":"before\tafter"}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ content: "before\tafter" })
				expect(result.repaired).toBe(true)
				expect(result.source).toBe('{"content":"before\\tafter"}')
			}
		})

		it("should repair multiple raw tabs in the same string", () => {
			const input = '{"content":"a\tb\tc\td"}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ content: "a\tb\tc\td" })
				expect(result.repaired).toBe(true)
			}
		})

		it("should repair raw tabs in multiple string fields", () => {
			const input = '{"field1":"has\ttab","field2":"also\ttab"}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ field1: "has\ttab", field2: "also\ttab" })
				expect(result.repaired).toBe(true)
			}
		})

		it("should not modify tabs outside of string literals", () => {
			// This tests that tabs used as whitespace in JSON structure are preserved
			// Note: standard JSON.parse handles tabs as whitespace fine, this just ensures
			// our repair doesn't break that
			const input = '{\t"name"\t:\t"value"\t}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ name: "value" })
				expect(result.repaired).toBe(false) // No repair needed - tabs outside strings are valid
			}
		})
	})

	describe("invalid JSON", () => {
		it("should return error for completely invalid JSON", () => {
			const input = "not json at all"
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error)
				expect(result.repaired).toBe(false) // No repair attempted since no strings with tabs
			}
		})

		it("should return error for unclosed strings", () => {
			const input = '{"name":"unclosed'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(false)
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error)
			}
		})

		it("should successfully parse partial JSON after repair due to lenient parser", () => {
			// This has a raw tab AND other syntax errors
			// parseJSON is lenient and parses what it can, so this succeeds
			const input = '{"content":"has\ttab", broken}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			// parseJSON successfully parses the valid portion after tab repair
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ content: "has\ttab" })
				expect(result.repaired).toBe(true)
			}
		})
	})

	describe("edge cases", () => {
		it("should handle empty object", () => {
			const result = safeParsePossiblyTabCorruptedJson("{}")
			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({})
			}
		})

		it("should handle empty string input", () => {
			const result = safeParsePossiblyTabCorruptedJson("")
			expect(result.ok).toBe(false)
		})

		it("should handle string with escaped backslash before tab", () => {
			// The \\\t should be parsed as escaped backslash followed by tab
			const input = '{"path":"C:\\\\folder\tname"}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.repaired).toBe(true)
			}
		})

		it("should handle nested objects with tabs", () => {
			const input = '{"outer":{"inner":"has\ttab"}}'
			const result = safeParsePossiblyTabCorruptedJson(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual({ outer: { inner: "has\ttab" } })
				expect(result.repaired).toBe(true)
			}
		})

		it("should handle arrays with tabs in string elements", () => {
			const input = '["no tab","has\ttab","also\ttab"]'
			const result = safeParsePossiblyTabCorruptedJson<string[]>(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				expect(result.value).toEqual(["no tab", "has\ttab", "also\ttab"])
				expect(result.repaired).toBe(true)
			}
		})
	})

	describe("type parameter", () => {
		it("should return correctly typed result", () => {
			interface TestType {
				name: string
				count: number
			}
			const input = '{"name":"test","count":42}'
			const result = safeParsePossiblyTabCorruptedJson<TestType>(input)

			expect(result.ok).toBe(true)
			if (result.ok) {
				// TypeScript should know value is TestType
				expect(result.value.name).toBe("test")
				expect(result.value.count).toBe(42)
			}
		})
	})
})
