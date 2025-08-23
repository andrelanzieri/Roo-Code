import { describe, it, expect, beforeAll } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"
import sampleJavaSimpleContent from "./fixtures/sample-java-simple"

describe("Java parsing - duplication issue", () => {
	let parseResult: string = ""

	beforeAll(async () => {
		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const result = await testParseSourceCodeDefinitions(
			"/test/TestClass.java",
			sampleJavaSimpleContent,
			testOptions,
		)
		if (!result) {
			throw new Error("Failed to parse Java source code")
		}
		parseResult = result
		console.log("\n=== PARSE RESULT ===")
		console.log(parseResult)
		console.log("====================\n")

		// Show individual lines for debugging
		const lines = parseResult.split("\n").filter((line) => line.trim())
		console.log("\n=== INDIVIDUAL LINES ===")
		lines.forEach((line, i) => {
			console.log(`Line ${i}: ${line}`)
		})
		console.log("========================\n")
	})

	it("should parse interface declaration without duplication", () => {
		const lines = parseResult.split("\n").filter((line) => line.trim())

		// Count occurrences of interface declaration
		const interfaceLines = lines.filter((line) => line.includes("interface TestInterface"))
		console.log("Interface lines found:", interfaceLines)

		// Should appear exactly once
		expect(interfaceLines.length).toBe(1)
	})

	it("should parse class declaration without duplication", () => {
		const lines = parseResult.split("\n").filter((line) => line.trim())

		// Count occurrences of class declaration
		const classLines = lines.filter((line) => line.includes("class TestClass"))
		console.log("Class lines found:", classLines)

		// Should appear exactly once
		expect(classLines.length).toBe(1)
	})

	it("should parse each method without duplication", () => {
		const lines = parseResult.split("\n").filter((line) => line.trim())

		// Check testMethod
		const testMethodLines = lines.filter((line) => line.includes("testMethod"))
		console.log("testMethod lines found:", testMethodLines)
		expect(testMethodLines.length).toBe(1)

		// Check getName
		const getNameLines = lines.filter((line) => line.includes("getName"))
		console.log("getName lines found:", getNameLines)
		expect(getNameLines.length).toBe(1)

		// Check calculate
		const calculateLines = lines.filter((line) => line.includes("calculate"))
		console.log("calculate lines found:", calculateLines)
		expect(calculateLines.length).toBe(1)

		// Check helperMethod
		const helperLines = lines.filter((line) => line.includes("helperMethod"))
		console.log("helperMethod lines found:", helperLines)
		expect(helperLines.length).toBe(1)
	})

	it("should show method signatures, not annotations", () => {
		const lines = parseResult.split("\n").filter((line) => line.trim())

		// Check that @Override doesn't appear as a standalone line
		const overrideOnlyLines = lines.filter((line) => {
			const trimmed = line.split("|")[1]?.trim() || ""
			return trimmed === "@Override"
		})
		console.log("Lines with only @Override:", overrideOnlyLines)

		// Should not have any lines with just @Override
		expect(overrideOnlyLines.length).toBe(0)
	})

	it("should show correct line ranges for methods with annotations", () => {
		const lines = parseResult.split("\n").filter((line) => line.trim())

		// For methods with @Override, the line range should include the annotation
		// but the displayed text should be the method signature
		const methodWithOverride = lines.find((line) => line.includes("public void testMethod"))
		console.log("Method with @Override:", methodWithOverride)

		if (methodWithOverride) {
			// Extract line range
			const match = methodWithOverride.match(/(\d+)--(\d+)/)
			if (match) {
				const startLine = parseInt(match[1])
				const endLine = parseInt(match[2])

				// The range should span multiple lines (including @Override)
				expect(endLine - startLine).toBeGreaterThanOrEqual(1)
			}

			// The displayed text should be the method signature, not @Override
			expect(methodWithOverride).toContain("public void testMethod")
			expect(methodWithOverride).not.toContain("@Override")
		}
	})
})
