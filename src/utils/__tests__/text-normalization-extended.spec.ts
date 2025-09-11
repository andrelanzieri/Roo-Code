import { describe, it, expect } from "vitest"
import { unescapeHtmlEntities } from "../text-normalization"

describe("Extended HTML entity unescaping", () => {
	describe("unescapeHtmlEntities", () => {
		it("unescapes alternative apostrophe encoding", () => {
			const input = "It&#x27;s working"
			const expected = "It's working"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("unescapes forward slash", () => {
			const input = "path&#x2F;to&#x2F;file"
			const expected = "path/to/file"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("unescapes backslash", () => {
			const input = "C:&#x5C;Users&#x5C;file"
			const expected = "C:\\Users\\file"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("unescapes backtick", () => {
			const input = "&#x60;code&#x60;"
			const expected = "`code`"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("unescapes non-breaking space", () => {
			const input = "Hello&nbsp;World"
			const expected = "Hello World"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("handles complex mixed content with all entity types", () => {
			const input =
				"&lt;div class=&quot;test&quot;&gt;It&#x27;s a &nbsp;test&#x2F;path&#x5C;file with &#x60;code&#x60; &amp; more&lt;/div&gt;"
			const expected = '<div class="test">It\'s a  test/path\\file with `code` & more</div>'
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("handles Gemini-style escaped markdown content", () => {
			const input =
				"```python\n&lt;search&gt;\ndef old_function():\n    return &#x27;old&#x27;\n&lt;/search&gt;\n&lt;replace&gt;\ndef new_function():\n    return &#x27;new&#x27;\n&lt;/replace&gt;\n```"
			const expected =
				"```python\n<search>\ndef old_function():\n    return 'old'\n</search>\n<replace>\ndef new_function():\n    return 'new'\n</replace>\n```"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})

		it("correctly orders ampersand unescaping to avoid double-unescaping", () => {
			const input = "&amp;lt;&amp;gt;&amp;amp;"
			const expected = "&lt;&gt;&amp;"
			expect(unescapeHtmlEntities(input)).toBe(expected)
		})
	})
})
