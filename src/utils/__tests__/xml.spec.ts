import { parseXml, parseXmlForDiff } from "../xml"

describe("parseXml", () => {
	describe("type conversion", () => {
		// Test the main change from the commit: no automatic type conversion
		it("should not convert string numbers to numbers", () => {
			const xml = `
        <root>
          <numericString>123</numericString>
          <negativeNumericString>-456</negativeNumericString>
          <floatNumericString>123.456</floatNumericString>
        </root>
      `

			const result = parseXml(xml) as any

			// Ensure these remain as strings and are not converted to numbers
			expect(typeof result.root.numericString).toBe("string")
			expect(result.root.numericString).toBe("123")

			expect(typeof result.root.negativeNumericString).toBe("string")
			expect(result.root.negativeNumericString).toBe("-456")

			expect(typeof result.root.floatNumericString).toBe("string")
			expect(result.root.floatNumericString).toBe("123.456")
		})

		it("should not convert string booleans to booleans", () => {
			const xml = `
        <root>
          <boolTrue>true</boolTrue>
          <boolFalse>false</boolFalse>
        </root>
      `

			const result = parseXml(xml) as any

			// Ensure these remain as strings and are not converted to booleans
			expect(typeof result.root.boolTrue).toBe("string")
			expect(result.root.boolTrue).toBe("true")

			expect(typeof result.root.boolFalse).toBe("string")
			expect(result.root.boolFalse).toBe("false")
		})

		it("should not convert attribute values to their respective types", () => {
			const xml = `
        <root>
          <node id="123" enabled="true" disabled="false" float="3.14" />
        </root>
      `

			const result = parseXml(xml) as any
			const attributes = result.root.node

			// Check that attributes remain as strings
			expect(typeof attributes["@_id"]).toBe("string")
			expect(attributes["@_id"]).toBe("123")

			expect(typeof attributes["@_enabled"]).toBe("string")
			expect(attributes["@_enabled"]).toBe("true")

			expect(typeof attributes["@_disabled"]).toBe("string")
			expect(attributes["@_disabled"]).toBe("false")

			expect(typeof attributes["@_float"]).toBe("string")
			expect(attributes["@_float"]).toBe("3.14")
		})
	})

	describe("basic functionality", () => {
		it("should correctly parse a simple XML string", () => {
			const xml = `
        <root>
          <name>Test Name</name>
          <description>Some description</description>
        </root>
      `

			const result = parseXml(xml) as any

			expect(result).toHaveProperty("root")
			expect(result.root).toHaveProperty("name", "Test Name")
			expect(result.root).toHaveProperty("description", "Some description")
		})

		it("should handle attributes correctly", () => {
			const xml = `
        <root>
          <item id="1" category="test">Item content</item>
        </root>
      `

			const result = parseXml(xml) as any

			expect(result.root.item).toHaveProperty("@_id", "1")
			expect(result.root.item).toHaveProperty("@_category", "test")
			expect(result.root.item).toHaveProperty("#text", "Item content")
		})

		it("should support stopNodes parameter", () => {
			const xml = `
        <root>
          <data>
            <nestedXml><item>Should not parse this</item></nestedXml>
          </data>
        </root>
      `

			const result = parseXml(xml, ["nestedXml"]) as any

			// With stopNodes, the parser still parses the structure but stops at the specified node
			expect(result.root.data.nestedXml).toBeTruthy()
			expect(result.root.data.nestedXml).toHaveProperty("item", "Should not parse this")
		})
	})

	describe("whitespace handling", () => {
		it("should handle spaces within path tags", () => {
			const xml = `
				<args>
					<file>
						<path> ./test/file.ts </path>
					</file>
				</args>
			`

			const result = parseXml(xml) as any

			// The path should be trimmed
			expect(result.args.file.path).toBe("./test/file.ts")
		})

		it("should handle newlines and spaces in nested tags", () => {
			const xml = `
				<args>
					<file>
						<path>
							src/shared/infrastructure/supabase/factory.py
						</path>
					</file>
				</args>
			`

			const result = parseXml(xml) as any

			// The path should be trimmed
			expect(result.args.file.path).toBe("src/shared/infrastructure/supabase/factory.py")
		})

		it("should handle multiple files with varying whitespace", () => {
			const xml = `
				<args>
					<file>
						<path> file1.ts </path>
					</file>
					<file>
						<path>
							file2.ts
						</path>
					</file>
					<file>
						<path>file3.ts</path>
					</file>
				</args>
			`

			const result = parseXml(xml) as any

			// All paths should be trimmed
			expect(Array.isArray(result.args.file)).toBe(true)
			expect(result.args.file[0].path).toBe("file1.ts")
			expect(result.args.file[1].path).toBe("file2.ts")
			expect(result.args.file[2].path).toBe("file3.ts")
		})

		it("should handle empty or whitespace-only path tags", () => {
			const xml = `
				<args>
					<file>
						<path>   </path>
					</file>
				</args>
			`

			const result = parseXml(xml) as any

			// Empty string after trimming
			expect(result.args.file.path).toBe("")
		})

		it("should handle tabs and mixed whitespace", () => {
			const xml = `
				<args>
					<file>
						<path>
							./path/with/tabs.ts
							</path>
					</file>
				</args>
			`

			const result = parseXml(xml) as any

			// Should trim tabs and newlines
			expect(result.args.file.path).toBe("./path/with/tabs.ts")
		})

		it("should handle the exact format from Grok that was failing", () => {
			// This is the exact format that was causing issues with Grok
			const xml = `<read_file>
<args>
<file>
<path>src/shared/infrastructure/supabase/factory.py</path>
</file>
</args>
</read_file>`

			// First extract just the args portion
			const argsMatch = xml.match(/<args>([\s\S]*?)<\/args>/)
			expect(argsMatch).toBeTruthy()

			if (argsMatch) {
				const argsXml = `<args>${argsMatch[1]}</args>`
				const result = parseXml(argsXml) as any

				expect(result.args.file.path).toBe("src/shared/infrastructure/supabase/factory.py")
			}
		})
	})
})

describe("parseXmlForDiff", () => {
	describe("HTML entity handling", () => {
		it("should NOT decode HTML entities like &amp;", () => {
			const xml = `
        <root>
          <content>Team Identity &amp; Project Positioning</content>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			// The &amp; should remain as-is, not be decoded to &
			expect(result.root.content).toBe("Team Identity &amp; Project Positioning")
		})

		it("should preserve & character without encoding", () => {
			const xml = `
        <root>
          <content>Team Identity & Project Positioning</content>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			// The & should remain as-is
			expect(result.root.content).toBe("Team Identity & Project Positioning")
		})

		it("should NOT decode other HTML entities", () => {
			const xml = `
        <root>
          <content>&lt;div&gt; &quot;Hello&quot; &apos;World&apos;</content>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			// All HTML entities should remain as-is
			expect(result.root.content).toBe("&lt;div&gt; &quot;Hello&quot; &apos;World&apos;")
		})

		it("should handle mixed content with entities correctly", () => {
			const xml = `
        <root>
          <code>if (a &lt; b &amp;&amp; c &gt; d) { return &quot;test&quot;; }</code>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			// All entities should remain unchanged
			expect(result.root.code).toBe("if (a &lt; b &amp;&amp; c &gt; d) { return &quot;test&quot;; }")
		})
	})

	describe("basic functionality (same as parseXml)", () => {
		it("should correctly parse a simple XML string", () => {
			const xml = `
        <root>
          <name>Test Name</name>
          <description>Some description</description>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			expect(result).toHaveProperty("root")
			expect(result.root).toHaveProperty("name", "Test Name")
			expect(result.root).toHaveProperty("description", "Some description")
		})

		it("should handle attributes correctly", () => {
			const xml = `
        <root>
          <item id="1" category="test">Item content</item>
        </root>
      `

			const result = parseXmlForDiff(xml) as any

			expect(result.root.item).toHaveProperty("@_id", "1")
			expect(result.root.item).toHaveProperty("@_category", "test")
			expect(result.root.item).toHaveProperty("#text", "Item content")
		})

		it("should support stopNodes parameter", () => {
			const xml = `
        <root>
          <data>
            <nestedXml><item>Should not parse this</item></nestedXml>
          </data>
        </root>
      `

			const result = parseXmlForDiff(xml, ["nestedXml"]) as any

			expect(result.root.data.nestedXml).toBeTruthy()
			expect(result.root.data.nestedXml).toHaveProperty("item", "Should not parse this")
		})
	})

	describe("diff-specific use case", () => {
		it("should preserve exact content for diff matching", () => {
			// This simulates the actual use case from the issue
			const xml = `
        <args>
          <file>
            <path>./doc.md</path>
            <diff>
              <content>Team Identity & Project Positioning</content>
            </diff>
          </file>
        </args>
      `

			const result = parseXmlForDiff(xml, ["file.diff.content"]) as any

			// The & should remain as-is for exact matching with file content
			expect(result.args.file.diff.content).toBe("Team Identity & Project Positioning")
		})
	})
})
