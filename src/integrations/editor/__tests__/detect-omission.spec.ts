import { detectCodeOmission } from "../detect-omission"

describe("detectCodeOmission", () => {
	const originalContent = `function example() {
  // Some code
  const x = 1;
  const y = 2;
  return x + y;
}`

	// Generate content with a specified number of lines (100+ lines triggers detection)
	const generateLongContent = (commentLine: string, length: number = 110) => {
		return `${commentLine}
	${Array.from({ length }, (_, i) => `const x${i} = ${i};`).join("\n")}
	const y = 2;`
	}

	describe("Basic functionality", () => {
		it("should skip comment checks for files under 100 lines", () => {
			const newContent = `// Lines 1-50 remain unchanged
const z = 3;`
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not detect regular comments without omission keywords", () => {
			const newContent = generateLongContent("// Adding new functionality")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not detect when comment is part of original content", () => {
			const originalWithComment = `// Content remains unchanged
${originalContent}`
			const newContent = generateLongContent("// Content remains unchanged")
			expect(detectCodeOmission(originalWithComment, newContent)).toBe(false)
		})

		it("should not detect code that happens to contain omission keywords", () => {
			const newContent = generateLongContent(`const remains = 'some value';
const unchanged = true;`)
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})
	})

	describe("Strong omission patterns (should detect)", () => {
		it("should detect ellipsis patterns", () => {
			const newContent = generateLongContent("// ... rest of code unchanged")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect 'rest of code remains' pattern", () => {
			const newContent = generateLongContent("// Rest of the code remains unchanged")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect 'previous code remains' pattern", () => {
			const newContent = generateLongContent("// Previous code remains here")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect 'code truncated' pattern", () => {
			const newContent = generateLongContent("// Code truncated for brevity")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect line range patterns", () => {
			const newContent = generateLongContent("// [lines 50-100 remain unchanged]")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect Python-style omission comments", () => {
			const newContent = generateLongContent("# Previous content remains here")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect multi-line comment omissions", () => {
			const newContent = generateLongContent("/* Previous content remains the same */")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect JSX comment omissions", () => {
			const newContent = generateLongContent("{/* Rest of the code remains the same */}")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect HTML comment omissions", () => {
			const newContent = generateLongContent("<!-- Existing content unchanged -->")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should detect square bracket notation", () => {
			const newContent = generateLongContent("[Previous content from line 1-305 remains exactly the same]")
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})
	})

	describe("Legitimate documentation patterns (should NOT detect)", () => {
		it("should not flag single keyword documentation comments", () => {
			const newContent = generateLongContent("// Add to existing configuration")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag 'NEW' annotations in markdown examples", () => {
			const newContent = generateLongContent("# NEW: Service configuration")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag makefile comments", () => {
			const newContent = generateLongContent("# Add to orchestrator startup sequence")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag step-by-step instructions", () => {
			const newContent = generateLongContent("// Step 1: Initialize the service")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag configuration comments", () => {
			const newContent = generateLongContent("// Configuration for production environment")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag TODO comments", () => {
			const newContent = generateLongContent("// TODO: Add error handling here")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag FIXME comments", () => {
			const newContent = generateLongContent("// FIXME: This needs to be refactored")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag NOTE comments", () => {
			const newContent = generateLongContent("// NOTE: This is important for performance")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag WARNING comments", () => {
			const newContent = generateLongContent("// WARNING: Do not modify this section")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag single 'unchanged' word in different context", () => {
			const newContent = generateLongContent("// Keep this value unchanged during migration")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag single 'remains' word in different context", () => {
			const newContent = generateLongContent("// The responsibility remains with the caller")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag legitimate YAML comments", () => {
			const newContent = generateLongContent("# Service configuration for Docker")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag legitimate JSON5 comments", () => {
			const newContent = generateLongContent("// API endpoint configuration")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag legitimate shell script comments", () => {
			const newContent = generateLongContent("# Install dependencies first")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})

		it("should not flag legitimate SQL comments", () => {
			const newContent = generateLongContent("-- Create indexes for better performance")
			expect(detectCodeOmission(originalContent, newContent)).toBe(false)
		})
	})

	describe("Edge cases", () => {
		it("should not flag legitimate comments when in original", () => {
			const originalWithComment = `// This is a legitimate comment that remains here
${originalContent}`
			const newContent = generateLongContent("// This is a legitimate comment that remains here")
			expect(detectCodeOmission(originalWithComment, newContent)).toBe(false)
		})

		it("should handle mixed legitimate and suspicious patterns correctly", () => {
			const legitimateComment = "// Add this to your configuration"
			const suspiciousComment = "// ... rest of code remains unchanged"
			const newContent = generateLongContent(`${legitimateComment}\n${suspiciousComment}`)
			expect(detectCodeOmission(originalContent, newContent)).toBe(true)
		})

		it("should handle empty files", () => {
			expect(detectCodeOmission("", "")).toBe(false)
		})

		it("should handle files with only comments", () => {
			const newContent = generateLongContent("// This is just a comment file")
			expect(detectCodeOmission("", newContent)).toBe(false)
		})
	})
})
