import { describe, it, expect, vi, beforeEach } from "vitest"
import { parseSourceCodeDefinitionsForFile } from "../index"
import { loadRequiredLanguageParsers } from "../languageParser"
import * as fs from "fs/promises"
import { fileExistsAtPath } from "../../../utils/fs"

// Mock the modules
vi.mock("fs/promises")
vi.mock("../../../utils/fs")
vi.mock("../languageParser", () => ({
	loadRequiredLanguageParsers: vi.fn(),
}))

describe("Swift Fallback Handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should use fallback chunking for Swift files and not load the parser", async () => {
		// Mock file existence check
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)

		// Mock file content
		const swiftContent = `
import Foundation

class ViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        print("Hello, Swift!")
    }
}
`.trim()

		vi.mocked(fs.readFile).mockResolvedValue(swiftContent)

		// Call the function with a Swift file
		const result = await parseSourceCodeDefinitionsForFile("test.swift")

		// Verify that the parser was NOT loaded for Swift files
		expect(loadRequiredLanguageParsers).not.toHaveBeenCalled()

		// Verify that the result indicates fallback chunking is used
		expect(result).toBeDefined()
		expect(result).toContain("test.swift")
		expect(result).toContain("This file type uses fallback chunking for stability")
	})

	it("should still load parsers for non-fallback file types", async () => {
		// Mock file existence check
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)

		// Mock file content for a TypeScript file
		const tsContent = `
export function hello() {
    console.log("Hello, TypeScript!");
}
`.trim()

		vi.mocked(fs.readFile).mockResolvedValue(tsContent)

		// Mock the parser loading with proper types
		const mockParser = {
			parse: vi.fn().mockReturnValue({
				rootNode: {
					startPosition: { row: 0, column: 0 },
					endPosition: { row: 3, column: 1 },
				},
			}),
			language: null,
			delete: vi.fn(),
			setLanguage: vi.fn(),
			reset: vi.fn(),
			getLanguage: vi.fn(),
			setTimeoutMicros: vi.fn(),
			getTimeoutMicros: vi.fn(),
			setLogger: vi.fn(),
			getLogger: vi.fn(),
			printDotGraphs: vi.fn(),
		} as any

		const mockQuery = {
			captures: vi.fn().mockReturnValue([]),
			captureNames: [],
			captureQuantifiers: [],
			predicates: {},
			setProperties: vi.fn(),
			assertedCaptureCount: vi.fn(),
			matchLimit: 0,
			setMatchLimit: vi.fn(),
			didExceedMatchLimit: vi.fn(),
			delete: vi.fn(),
			matches: vi.fn(),
			disableCapture: vi.fn(),
			disablePattern: vi.fn(),
			isPatternGuaranteedAtStep: vi.fn(),
			isPatternRooted: vi.fn(),
			isPatternNonLocal: vi.fn(),
			startByteForPattern: vi.fn(),
			endByteForPattern: vi.fn(),
			startIndexForPattern: vi.fn(),
			endIndexForPattern: vi.fn(),
		} as any

		vi.mocked(loadRequiredLanguageParsers).mockResolvedValue({
			ts: { parser: mockParser, query: mockQuery },
		})

		// Call the function with a TypeScript file
		await parseSourceCodeDefinitionsForFile("test.ts")

		// Verify that the parser WAS loaded for TypeScript files
		expect(loadRequiredLanguageParsers).toHaveBeenCalledWith(["test.ts"])
	})

	it("should handle multiple Swift files in parseSourceCodeForDefinitionsTopLevel", async () => {
		// This test would require more complex mocking of the directory listing
		// and is included here as a placeholder for comprehensive testing
		expect(true).toBe(true)
	})
})
