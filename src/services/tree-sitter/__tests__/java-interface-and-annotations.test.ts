import { describe, it, expect } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"

describe("Java interface methods and annotations", () => {
	it("should correctly parse interface methods", async () => {
		const interfaceContent = `interface TestInterface {
    /**
     * This is a test method
     */
    void testMethod();
    
    String getName();
    
    int calculate(int a, int b);
}`

		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const parseResult = await testParseSourceCodeDefinitions(
			"/test/TestInterface.java",
			interfaceContent,
			testOptions,
		)

		console.log("\n=== INTERFACE PARSE RESULT ===")
		console.log(parseResult)
		console.log("==============================\n")

		// Interface methods should be detected
		expect(parseResult).toBeTruthy()

		// Force test to fail to see output
		if (!parseResult) {
			throw new Error("No parse result for interface")
		}
		if (!parseResult.includes("testMethod")) {
			throw new Error(`Interface methods not detected. Result:\n${parseResult}`)
		}
		expect(parseResult).toContain("testMethod")
		expect(parseResult).toContain("getName")
		expect(parseResult).toContain("calculate")
	})

	it("should correctly handle multiple annotations on methods", async () => {
		const classContent = `class TestClass implements TestInterface {

    @Override
    @Test
    public void testMethod() {
        // Implementation goes here
    }
    
    @Override
    public String getName() {
        return "TestClass";
    }
    
    @Override
    @Deprecated
    public int calculate(int a, int b) {
        return a + b;
    }
    
    @SuppressWarnings("unchecked")
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

		const parseResult = await testParseSourceCodeDefinitions("/test/TestClass.java", classContent, testOptions)

		console.log("\n=== CLASS PARSE RESULT ===")
		console.log(parseResult)
		console.log("==========================\n")

		if (parseResult) {
			const lines = parseResult.split("\n").filter((line) => line.trim())

			// Check that method names are shown, not annotations
			const hasMethodNames = lines.some((line) => line.includes("testMethod"))
			const hasGetName = lines.some((line) => line.includes("getName"))
			const hasCalculate = lines.some((line) => line.includes("calculate"))
			const hasHelper = lines.some((line) => line.includes("helperMethod"))

			// Check for the bug: annotations shown as method names
			const hasStandaloneOverride = lines.some(
				(line) =>
					line.includes("@Override") &&
					!line.includes("testMethod") &&
					!line.includes("getName") &&
					!line.includes("calculate"),
			)
			const hasStandaloneTest = lines.some((line) => line.includes("@Test") && !line.includes("testMethod"))
			const hasStandaloneDeprecated = lines.some(
				(line) => line.includes("@Deprecated") && !line.includes("calculate"),
			)

			console.log("Method detection:")
			console.log("  testMethod:", hasMethodNames)
			console.log("  getName:", hasGetName)
			console.log("  calculate:", hasCalculate)
			console.log("  helperMethod:", hasHelper)
			console.log("\nAnnotation issues:")
			console.log("  Standalone @Override:", hasStandaloneOverride)
			console.log("  Standalone @Test:", hasStandaloneTest)
			console.log("  Standalone @Deprecated:", hasStandaloneDeprecated)

			// All methods should be detected
			expect(hasMethodNames).toBe(true)
			expect(hasGetName).toBe(true)
			expect(hasCalculate).toBe(true)
			expect(hasHelper).toBe(true)

			// Annotations should not appear as standalone method names
			expect(hasStandaloneOverride).toBe(false)
			expect(hasStandaloneTest).toBe(false)
			expect(hasStandaloneDeprecated).toBe(false)
		}
	})
})
