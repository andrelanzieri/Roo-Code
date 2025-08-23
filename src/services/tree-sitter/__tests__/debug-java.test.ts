import { describe, it, expect } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"
import * as fs from "fs"

describe("Debug Java parsing", () => {
	it("should show what's being captured", async () => {
		const javaContent = `class TestClass implements TestInterface {
    
    @Override
    public void testMethod() {
        // Implementation goes here
    }
    
    @Override
    public String getName() {
        return "TestClass";
    }
    
    private void helperMethod() {
        // Helper implementation
    }
}`

		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const parseResult = await testParseSourceCodeDefinitions("/test/TestClass.java", javaContent, testOptions)

		let debugOutput = ""

		if (parseResult) {
			debugOutput += "\n=== FULL PARSE RESULT ===\n"
			debugOutput += parseResult + "\n"
			debugOutput += "========================\n"

			const lines = parseResult.split("\n").filter((line) => line.trim())
			debugOutput += "\n=== INDIVIDUAL LINES ===\n"
			lines.forEach((line, i) => {
				debugOutput += `Line ${i}: ${line}\n`
			})
			debugOutput += "========================\n"

			// Check for duplicates
			const methodLines = lines.filter((line) => line.includes("testMethod"))
			debugOutput += "\n=== testMethod LINES ===\n"
			methodLines.forEach((line) => (debugOutput += line + "\n"))
			debugOutput += "========================\n"

			// Check for @Override lines
			const overrideLines = lines.filter((line) => {
				const content = line.split("|")[1]?.trim() || ""
				return content === "@Override"
			})
			debugOutput += "\n=== @Override ONLY LINES ===\n"
			overrideLines.forEach((line) => (debugOutput += line + "\n"))
			debugOutput += "============================\n"

			// Write to file
			fs.writeFileSync("debug-output.txt", debugOutput)
			console.log("Debug output written to debug-output.txt")
		}

		// This test is just for debugging, always pass
		expect(true).toBe(true)
	})
})
