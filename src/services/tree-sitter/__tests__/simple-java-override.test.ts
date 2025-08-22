import { describe, it, expect } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"

describe("Simple Java @Override test", () => {
	it("should show what gets captured for @Override methods", async () => {
		const overrideTestContent = `class TestClass {
    @Override
    public void testMethod() {
        // Implementation goes here
    }
}`

		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const parseResult = await testParseSourceCodeDefinitions("/test/file.java", overrideTestContent, testOptions)

		console.log("\n=== PARSE RESULT ===")
		console.log(parseResult)
		console.log("====================\n")

		if (parseResult) {
			const lines = parseResult.split("\n").filter((line) => line.trim())
			console.log("\n=== INDIVIDUAL LINES ===")
			lines.forEach((line, i) => {
				console.log(`Line ${i}: ${line}`)
			})
			console.log("========================\n")

			// Check for the issue
			const hasOverrideLine = lines.some((line) => line.includes("@Override") && !line.includes("testMethod"))

			if (hasOverrideLine) {
				console.log("❌ BUG CONFIRMED: @Override is shown without the method name")
				const problematicLines = lines.filter(
					(line) => line.includes("@Override") && !line.includes("testMethod"),
				)
				console.log("Problematic lines:", problematicLines)
			} else {
				console.log("✅ No issue found - @Override appears with method name")
			}

			// This test will fail if the bug exists
			expect(hasOverrideLine).toBe(false)
		}
	})
})
