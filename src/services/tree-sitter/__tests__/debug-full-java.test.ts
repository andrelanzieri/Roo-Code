import { describe, it, expect } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"
import sampleJavaContent from "./fixtures/sample-java"
import * as fs from "fs"

describe("Debug full Java parsing", () => {
	it("should show what's being captured for full sample", async () => {
		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const parseResult = await testParseSourceCodeDefinitions("/test/file.java", sampleJavaContent, testOptions)

		if (parseResult) {
			// Write to file
			fs.writeFileSync("debug-full-java-output.txt", parseResult)
			console.log("Debug output written to debug-full-java-output.txt")

			// Check for specific patterns
			const lines = parseResult.split("\n").filter((line) => line.trim())

			// Check for class with annotations
			const classLines = lines.filter((line) => line.includes("TestClassDefinition"))
			console.log("\n=== CLASS LINES ===")
			classLines.forEach((line) => console.log(line))

			// Check for annotation declarations
			const annotationLines = lines.filter((line) => line.includes("@Target") || line.includes("@TestAnnotation"))
			console.log("\n=== ANNOTATION LINES ===")
			annotationLines.forEach((line) => console.log(line))

			// Check for interface methods
			const interfaceMethodLines = lines.filter(
				(line) =>
					line.includes("void testInterfaceMethod") ||
					line.includes("default String testInterfaceDefaultMethod"),
			)
			console.log("\n=== INTERFACE METHOD LINES ===")
			interfaceMethodLines.forEach((line) => console.log(line))
		}

		// This test is just for debugging, always pass
		expect(true).toBe(true)
	})
})
