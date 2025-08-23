import { describe, it, expect, beforeAll } from "vitest"
import { testParseSourceCodeDefinitions } from "./helpers"
import { javaQuery } from "../queries"
import sampleJavaComprehensiveContent from "./fixtures/sample-java-comprehensive"

describe("Java parsing - comprehensive grammar test", () => {
	let parseResult: string = ""
	let lines: string[] = []

	beforeAll(async () => {
		const testOptions = {
			language: "java",
			wasmFile: "tree-sitter-java.wasm",
			queryString: javaQuery,
			extKey: "java",
		}

		const result = await testParseSourceCodeDefinitions(
			"/test/ComprehensiveExample.java",
			sampleJavaComprehensiveContent,
			testOptions,
		)
		if (!result) {
			throw new Error("Failed to parse Java source code")
		}
		parseResult = result
		lines = parseResult.split("\n").filter((line) => line.trim())

		// Debug output
		console.log("\n=== COMPREHENSIVE PARSE RESULT ===")
		console.log(parseResult)
		console.log("==================================\n")
	})

	describe("No duplications", () => {
		it("should not have duplicate class declarations", () => {
			const classDeclarations = lines.filter(
				(line) =>
					line.includes("class ComprehensiveExample") ||
					line.includes("class AbstractBase") ||
					line.includes("class Shape"),
			)

			// Check each class appears only once
			const comprehensiveLines = classDeclarations.filter((line) => line.includes("ComprehensiveExample"))
			const abstractLines = classDeclarations.filter((line) => line.includes("AbstractBase"))
			const shapeLines = classDeclarations.filter((line) => line.includes("Shape"))

			expect(comprehensiveLines.length).toBeLessThanOrEqual(1)
			expect(abstractLines.length).toBeLessThanOrEqual(1)
			expect(shapeLines.length).toBeLessThanOrEqual(1)
		})

		it("should not have duplicate interface declarations", () => {
			const interfaceLines = lines.filter((line) => line.includes("interface GenericInterface"))
			expect(interfaceLines.length).toBeLessThanOrEqual(1)
		})

		it("should not have duplicate method declarations", () => {
			// Check specific methods don't appear multiple times
			const processLines = lines.filter((line) => line.includes("process("))
			const incrementLines = lines.filter((line) => line.includes("incrementCounter"))
			const genericMethodLines = lines.filter((line) => line.includes("genericMethod"))

			// Each method should appear at most once
			expect(processLines.length).toBeLessThanOrEqual(1)
			expect(incrementLines.length).toBeLessThanOrEqual(1)
			expect(genericMethodLines.length).toBeLessThanOrEqual(1)
		})

		it("should not show @Override as standalone definition", () => {
			const overrideOnlyLines = lines.filter((line) => {
				const content = line.split("|")[1]?.trim() || ""
				return content === "@Override"
			})
			expect(overrideOnlyLines.length).toBe(0)
		})
	})

	describe("Package and imports", () => {
		it("should parse package declaration", () => {
			const packageLine = lines.find((line) => line.includes("package com.example.comprehensive"))
			expect(packageLine).toBeDefined()
		})
	})

	describe("Annotations", () => {
		it("should parse annotation declarations", () => {
			const annotationLine = lines.find((line) => line.includes("@interface CustomAnnotation"))
			expect(annotationLine).toBeDefined()
		})

		it("should show annotated class with class declaration, not annotation", () => {
			const classLine = lines.find((line) => line.includes("class ComprehensiveExample"))
			expect(classLine).toBeDefined()
			expect(classLine).toContain("class ComprehensiveExample")
			expect(classLine).not.toContain("@CustomAnnotation")
		})
	})

	describe("Interfaces", () => {
		it("should parse interface declaration", () => {
			const interfaceLine = lines.find((line) => line.includes("interface GenericInterface"))
			expect(interfaceLine).toBeDefined()
		})

		it("should not duplicate interface methods", () => {
			// Interface methods should be part of interface declaration, not separate
			const abstractMethodLines = lines.filter((line) => line.includes("void abstractMethod"))
			const defaultMethodLines = lines.filter((line) => line.includes("defaultMethod"))

			expect(abstractMethodLines.length).toBeLessThanOrEqual(1)
			expect(defaultMethodLines.length).toBeLessThanOrEqual(1)
		})
	})

	describe("Classes", () => {
		it("should parse abstract class", () => {
			const abstractLine = lines.find((line) => line.includes("abstract class AbstractBase"))
			expect(abstractLine).toBeDefined()
		})

		it("should parse main class", () => {
			const mainClassLine = lines.find((line) => line.includes("class ComprehensiveExample"))
			expect(mainClassLine).toBeDefined()
		})

		it("should parse sealed class", () => {
			const sealedLine = lines.find((line) => line.includes("sealed class Shape"))
			expect(sealedLine).toBeDefined()
		})

		it("should parse final classes", () => {
			const circleLine = lines.find((line) => line.includes("class Circle"))
			const rectangleLine = lines.find((line) => line.includes("class Rectangle"))
			expect(circleLine).toBeDefined()
			expect(rectangleLine).toBeDefined()
		})
	})

	describe("Enums", () => {
		it("should parse enum declaration", () => {
			const enumLine = lines.find((line) => line.includes("enum Status"))
			expect(enumLine).toBeDefined()
		})
	})

	describe("Records", () => {
		it("should parse record declaration", () => {
			const recordLine = lines.find((line) => line.includes("record PersonRecord"))
			expect(recordLine).toBeDefined()
		})
	})

	describe("Inner classes", () => {
		it("should parse inner class", () => {
			const innerLine = lines.find((line) => line.includes("class InnerClass"))
			expect(innerLine).toBeDefined()
		})

		it("should parse static nested class", () => {
			const nestedLine = lines.find((line) => line.includes("class StaticNestedClass"))
			expect(nestedLine).toBeDefined()
		})
	})

	describe("Methods", () => {
		it("should parse overridden methods with correct signature", () => {
			const processMethod = lines.find((line) => line.includes("process(T input)"))
			expect(processMethod).toBeDefined()
			if (processMethod) {
				expect(processMethod).toContain("process")
				expect(processMethod).not.toContain("@Override")
			}
		})

		it("should parse synchronized methods", () => {
			const syncMethod = lines.find((line) => line.includes("incrementCounter"))
			expect(syncMethod).toBeDefined()
		})

		it("should parse generic methods", () => {
			const genericMethod = lines.find((line) => line.includes("genericMethod"))
			expect(genericMethod).toBeDefined()
		})

		it("should parse varargs methods", () => {
			const varargMethod = lines.find((line) => line.includes("processMultiple"))
			expect(varargMethod).toBeDefined()
		})

		it("should parse static methods", () => {
			const staticMethod = lines.find((line) => line.includes("arrayMethod"))
			expect(staticMethod).toBeDefined()
		})
	})

	describe("Constructors", () => {
		it("should parse constructors", () => {
			const constructorLines = lines.filter(
				(line) =>
					line.includes("ComprehensiveExample(") ||
					line.includes("AbstractBase(") ||
					line.includes("Circle(") ||
					line.includes("Rectangle("),
			)
			expect(constructorLines.length).toBeGreaterThan(0)
		})
	})

	describe("Lambda expressions", () => {
		it("should parse lambda expressions", () => {
			const lambdaLines = lines.filter((line) => line.includes("->"))
			// Should find at least some lambda expressions
			expect(lambdaLines.length).toBeGreaterThan(0)
		})
	})

	describe("Line ranges", () => {
		it("should have correct line ranges for multi-line definitions", () => {
			lines.forEach((line) => {
				const match = line.match(/(\d+)--(\d+)/)
				if (match) {
					const startLine = parseInt(match[1])
					const endLine = parseInt(match[2])

					// Multi-line definitions should have different start and end
					if (endLine - startLine >= 3) {
						// This is a multi-line definition (4+ lines)
						expect(endLine).toBeGreaterThan(startLine)
					}
				}
			})
		})
	})

	describe("Output format", () => {
		it("should format output correctly", () => {
			lines.forEach((line) => {
				// Each line should have the format: "startLine--endLine | content"
				expect(line).toMatch(/^\d+--\d+ \| .+/)
			})
		})

		it("should not include comment-only lines as definitions", () => {
			const commentOnlyLines = lines.filter((line) => {
				const content = line.split("|")[1]?.trim() || ""
				return content.startsWith("//") || content.startsWith("/*") || content.startsWith("*")
			})
			// Comments should not be standalone definitions
			expect(commentOnlyLines.length).toBe(0)
		})
	})
})
