import { parseXml } from "../xml"

describe("XML Parser Whitespace and Structure Handling", () => {
	describe("whitespace handling in read_file args", () => {
		it("should handle spaces around path values", () => {
			const xml = `
<args>
  <file>
    <path> ./test/file.ts </path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("./test/file.ts") // trimValues should remove spaces
		})

		it("should handle newlines and tabs in path values", () => {
			const xml = `
<args>
  <file>
    <path>
      ./test/file.ts
    </path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("./test/file.ts")
		})

		it("should handle multiple files with varying whitespace", () => {
			const xml = `
<args>
  <file>
    <path> ./file1.ts </path>
  </file>
  <file>
    <path>
      ./file2.ts
    </path>
  </file>
  <file>
    <path>	./file3.ts	</path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(Array.isArray(result.args.file)).toBe(true)
			expect(result.args.file[0].path).toBe("./file1.ts")
			expect(result.args.file[1].path).toBe("./file2.ts")
			expect(result.args.file[2].path).toBe("./file3.ts")
		})
	})

	describe("problematic structures from issue #7664", () => {
		it("should handle the exact structure from juliettefournier-econ's example", () => {
			// This is the exact structure that was causing issues
			const xml = `
<args>
<file>
<path>src/shared/infrastructure/supabase/factory.py</path>
<line_range>10-20</line_range>
</file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("src/shared/infrastructure/supabase/factory.py")
			expect(result.args.file.line_range).toBe("10-20")
		})

		it("should handle structure with no spaces between tags", () => {
			const xml = `<args><file><path>src/test.py</path><line_range>1-10</line_range></file></args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("src/test.py")
			expect(result.args.file.line_range).toBe("1-10")
		})

		it("should handle structure with mixed spacing", () => {
			const xml = `<args>
  <file><path>  src/test.py  </path>
    <line_range>1-10</line_range>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("src/test.py")
			expect(result.args.file.line_range).toBe("1-10")
		})

		it("should handle empty or whitespace-only path gracefully", () => {
			const xml1 = `
<args>
  <file>
    <path></path>
  </file>
</args>`

			const xml2 = `
<args>
  <file>
    <path>   </path>
  </file>
</args>`

			const result1 = parseXml(xml1) as any
			const result2 = parseXml(xml2) as any

			// Empty string after trimming
			expect(result1.args.file.path).toBe("")
			expect(result2.args.file.path).toBe("")
		})

		it("should handle missing path element", () => {
			const xml = `
<args>
  <file>
    <line_range>10-20</line_range>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBeUndefined()
			expect(result.args.file.line_range).toBe("10-20")
		})

		it("should handle self-closing tags", () => {
			const xml = `
<args>
  <file>
    <path/>
    <line_range>10-20</line_range>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("")
			expect(result.args.file.line_range).toBe("10-20")
		})
	})

	describe("edge cases with malformed XML", () => {
		it("should handle unclosed tags gracefully", () => {
			const xml = `
<args>
	 <file>
	   <path>test.py`

			// The parser is lenient and may not throw on some malformed XML
			const result = parseXml(xml) as any
			// Just verify it doesn't crash
			expect(result).toBeDefined()
		})

		it("should handle mismatched tags", () => {
			const xml = `
<args>
	 <file>
	   <path>test.py</file>
	 </path>
</args>`

			// The parser is lenient and may not throw on some malformed XML
			const result = parseXml(xml) as any
			// Just verify it doesn't crash
			expect(result).toBeDefined()
		})
	})

	describe("complex nested structures", () => {
		it("should handle deeply nested file structures", () => {
			const xml = `
<args>
  <file>
    <path>./deep/nested/path/file.ts</path>
    <metadata>
      <author>test</author>
      <date>2024-01-01</date>
    </metadata>
    <line_range>1-100</line_range>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("./deep/nested/path/file.ts")
			expect(result.args.file.line_range).toBe("1-100")
			expect(result.args.file.metadata.author).toBe("test")
			expect(result.args.file.metadata.date).toBe("2024-01-01")
		})

		it("should handle multiple line_range elements", () => {
			const xml = `
<args>
  <file>
    <path>test.py</path>
    <line_range>10-20</line_range>
    <line_range>30-40</line_range>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("test.py")
			expect(Array.isArray(result.args.file.line_range)).toBe(true)
			expect(result.args.file.line_range).toEqual(["10-20", "30-40"])
		})
	})

	describe("special characters in paths", () => {
		it("should handle paths with spaces", () => {
			const xml = `
<args>
  <file>
    <path>./my folder/my file.ts</path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("./my folder/my file.ts")
		})

		it("should handle paths with special characters", () => {
			const xml = `
<args>
  <file>
    <path>./test@file#2024$.ts</path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("./test@file#2024$.ts")
		})

		it("should handle Windows-style paths", () => {
			const xml = `
<args>
  <file>
    <path>C:\\Users\\test\\file.ts</path>
  </file>
</args>`

			const result = parseXml(xml) as any
			expect(result.args.file.path).toBe("C:\\Users\\test\\file.ts")
		})
	})
})
