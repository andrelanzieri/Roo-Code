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

describe("Swift Parser Handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should load and use the Swift parser for Swift files", async () => {
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

		// Mock the parser loading with proper types
		const mockParser = {
			parse: vi.fn().mockReturnValue({
				rootNode: {
					startPosition: { row: 0, column: 0 },
					endPosition: { row: 7, column: 1 },
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
			captures: vi.fn().mockReturnValue([
				{
					name: "definition.class",
					node: {
						text: "ViewController",
						startPosition: { row: 2, column: 0 },
						endPosition: { row: 7, column: 1 },
						parent: null,
					},
				},
			]),
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
			swift: { parser: mockParser, query: mockQuery },
		})

		// Call the function with a Swift file
		const result = await parseSourceCodeDefinitionsForFile("test.swift")

		// Verify that the parser WAS loaded for Swift files
		expect(loadRequiredLanguageParsers).toHaveBeenCalledWith(["test.swift"])

		// Verify that the result contains parsed content, not fallback message
		expect(result).toBeDefined()
		expect(result).toContain("test.swift")
		expect(result).not.toContain("fallback chunking")
		expect(result).toContain("class ViewController")
	})

	it("should handle Swift files with multiple definitions", async () => {
		// Mock file existence check
		vi.mocked(fileExistsAtPath).mockResolvedValue(true)

		// Mock file content with multiple Swift constructs
		const swiftContent = `
import Foundation

protocol DataSource {
    func numberOfItems() -> Int
}

struct Item {
    let id: String
    let name: String
}

class ViewController: UIViewController {
    private var items: [Item] = []
    
    override func viewDidLoad() {
        super.viewDidLoad()
    }
    
    func loadData() {
        // Load data implementation
    }
}

extension ViewController: DataSource {
    func numberOfItems() -> Int {
        return items.count
    }
}
`.trim()

		vi.mocked(fs.readFile).mockResolvedValue(swiftContent)

		// Mock the parser with multiple captures
		const mockParser = {
			parse: vi.fn().mockReturnValue({
				rootNode: {
					startPosition: { row: 0, column: 0 },
					endPosition: { row: 28, column: 1 },
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
			captures: vi.fn().mockReturnValue([
				{
					name: "definition.interface",
					node: {
						text: "DataSource",
						startPosition: { row: 2, column: 0 },
						endPosition: { row: 4, column: 1 },
						parent: null,
					},
				},
				{
					name: "definition.class",
					node: {
						text: "Item",
						startPosition: { row: 6, column: 0 },
						endPosition: { row: 9, column: 1 },
						parent: null,
					},
				},
				{
					name: "definition.class",
					node: {
						text: "ViewController",
						startPosition: { row: 11, column: 0 },
						endPosition: { row: 21, column: 1 },
						parent: null,
					},
				},
			]),
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
			swift: { parser: mockParser, query: mockQuery },
		})

		// Call the function with a Swift file
		const result = await parseSourceCodeDefinitionsForFile("test.swift")

		// Verify that the parser was loaded
		expect(loadRequiredLanguageParsers).toHaveBeenCalledWith(["test.swift"])

		// Verify that the result contains parsed content
		expect(result).toBeDefined()
		expect(result).toContain("test.swift")
		// The actual output shows line numbers and first lines of definitions
		expect(result).toMatch(/struct Item/)
		expect(result).toMatch(/class ViewController/)
	})
})
