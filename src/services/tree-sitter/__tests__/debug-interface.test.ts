import { describe, it, expect } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"
import * as fs from "fs"

describe("Debug Java interface parsing", () => {
	it("should show what's being captured for interface", async () => {
		const javaContent = `// Test interface with methods
interface TestInterface {
    void testMethod();
    String getName();
    int calculate(int a, int b);
}

// Test class implementing interface with annotations
class TestClass implements TestInterface {
    
    @Override
    public void testMethod() {
        // Implementation goes here
    }
    
    @Override
    public String getName() {
        return "TestClass";
    }
    
    @Override
    public int calculate(int a, int b) {
        return a + b;
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

		const parseResult = await testParseSourceCodeDefinitions("/test/TestFile.java", javaContent, testOptions)

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

			// Check for interface
			const interfaceLines = lines.filter((line) => line.includes("interface TestInterface"))
			debugOutput += "\n=== INTERFACE LINES ===\n"
			interfaceLines.forEach((line) => (debugOutput += line + "\n"))
			debugOutput += "========================\n"

			// Check for testMethod
			const methodLines = lines.filter((line) => line.includes("testMethod"))
			debugOutput += "\n=== testMethod LINES ===\n"
			methodLines.forEach((line) => (debugOutput += line + "\n"))
			debugOutput += "========================\n"

			// Write to file
			fs.writeFileSync("debug-interface-output.txt", debugOutput)
			console.log("Debug output written to debug-interface-output.txt")
		}

		// This test is just for debugging, always pass
		expect(true).toBe(true)
	})
})
