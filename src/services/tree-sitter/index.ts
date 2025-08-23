import * as fs from "fs/promises"
import * as path from "path"
import { listFiles } from "../glob/list-files"
import { LanguageParser, loadRequiredLanguageParsers } from "./languageParser"
import { fileExistsAtPath } from "../../utils/fs"
import { parseMarkdown } from "./markdownParser"
import { RooIgnoreController } from "../../core/ignore/RooIgnoreController"
import { QueryCapture } from "web-tree-sitter"

// Private constant
const DEFAULT_MIN_COMPONENT_LINES_VALUE = 4

// Getter function for MIN_COMPONENT_LINES (for easier testing)
let currentMinComponentLines = DEFAULT_MIN_COMPONENT_LINES_VALUE

/**
 * Get the current minimum number of lines for a component to be included
 */
export function getMinComponentLines(): number {
	return currentMinComponentLines
}

/**
 * Set the minimum number of lines for a component (for testing)
 */
export function setMinComponentLines(value: number): void {
	currentMinComponentLines = value
}

const extensions = [
	"tla",
	"js",
	"jsx",
	"ts",
	"vue",
	"tsx",
	"py",
	// Rust
	"rs",
	"go",
	// C
	"c",
	"h",
	// C++
	"cpp",
	"hpp",
	// C#
	"cs",
	// Ruby
	"rb",
	"java",
	"php",
	"swift",
	// Solidity
	"sol",
	// Kotlin
	"kt",
	"kts",
	// Elixir
	"ex",
	"exs",
	// Elisp
	"el",
	// HTML
	"html",
	"htm",
	// Markdown
	"md",
	"markdown",
	// JSON
	"json",
	// CSS
	"css",
	// SystemRDL
	"rdl",
	// OCaml
	"ml",
	"mli",
	// Lua
	"lua",
	// Scala
	"scala",
	// TOML
	"toml",
	// Zig
	"zig",
	// Elm
	"elm",
	// Embedded Template
	"ejs",
	"erb",
	// Visual Basic .NET
	"vb",
].map((e) => `.${e}`)

export { extensions }

export async function parseSourceCodeDefinitionsForFile(
	filePath: string,
	rooIgnoreController?: RooIgnoreController,
): Promise<string | undefined> {
	// check if the file exists
	const fileExists = await fileExistsAtPath(path.resolve(filePath))
	if (!fileExists) {
		return "This file does not exist or you do not have permission to access it."
	}

	// Get file extension to determine parser
	const ext = path.extname(filePath).toLowerCase()
	// Check if the file extension is supported
	if (!extensions.includes(ext)) {
		return undefined
	}

	// Special case for markdown files
	if (ext === ".md" || ext === ".markdown") {
		// Check if we have permission to access this file
		if (rooIgnoreController && !rooIgnoreController.validateAccess(filePath)) {
			return undefined
		}

		// Read file content
		const fileContent = await fs.readFile(filePath, "utf8")

		// Split the file content into individual lines
		const lines = fileContent.split("\n")

		// Parse markdown content to get captures
		const markdownCaptures = parseMarkdown(fileContent)

		// Process the captures
		const markdownDefinitions = processCaptures(markdownCaptures, lines, "markdown")

		if (markdownDefinitions) {
			return `# ${path.basename(filePath)}\n${markdownDefinitions}`
		}
		return undefined
	}

	// For other file types, load parser and use tree-sitter
	const languageParsers = await loadRequiredLanguageParsers([filePath])

	// Parse the file if we have a parser for it
	const definitions = await parseFile(filePath, languageParsers, rooIgnoreController)
	if (definitions) {
		return `# ${path.basename(filePath)}\n${definitions}`
	}

	return undefined
}

// TODO: implement caching behavior to avoid having to keep analyzing project for new tasks.
export async function parseSourceCodeForDefinitionsTopLevel(
	dirPath: string,
	rooIgnoreController?: RooIgnoreController,
): Promise<string> {
	// check if the path exists
	const dirExists = await fileExistsAtPath(path.resolve(dirPath))
	if (!dirExists) {
		return "This directory does not exist or you do not have permission to access it."
	}

	// Get all files at top level (not gitignored)
	const [allFiles, _] = await listFiles(dirPath, false, 200)

	let result = ""

	// Separate files to parse and remaining files
	const { filesToParse } = separateFiles(allFiles)

	// Filter filepaths for access if controller is provided
	const allowedFilesToParse = rooIgnoreController ? rooIgnoreController.filterPaths(filesToParse) : filesToParse

	// Separate markdown files from other files
	const markdownFiles: string[] = []
	const otherFiles: string[] = []

	for (const file of allowedFilesToParse) {
		const ext = path.extname(file).toLowerCase()
		if (ext === ".md" || ext === ".markdown") {
			markdownFiles.push(file)
		} else {
			otherFiles.push(file)
		}
	}

	// Load language parsers only for non-markdown files
	const languageParsers = await loadRequiredLanguageParsers(otherFiles)

	// Process markdown files
	for (const file of markdownFiles) {
		// Check if we have permission to access this file
		if (rooIgnoreController && !rooIgnoreController.validateAccess(file)) {
			continue
		}

		try {
			// Read file content
			const fileContent = await fs.readFile(file, "utf8")

			// Split the file content into individual lines
			const lines = fileContent.split("\n")

			// Parse markdown content to get captures
			const markdownCaptures = parseMarkdown(fileContent)

			// Process the captures
			const markdownDefinitions = processCaptures(markdownCaptures, lines, "markdown")

			if (markdownDefinitions) {
				result += `# ${path.relative(dirPath, file).toPosix()}\n${markdownDefinitions}\n`
			}
		} catch (error) {
			console.log(`Error parsing markdown file: ${error}\n`)
		}
	}

	// Process other files using tree-sitter
	for (const file of otherFiles) {
		const definitions = await parseFile(file, languageParsers, rooIgnoreController)
		if (definitions) {
			result += `# ${path.relative(dirPath, file).toPosix()}\n${definitions}\n`
		}
	}

	return result ? result : "No source code definitions found."
}

function separateFiles(allFiles: string[]): { filesToParse: string[]; remainingFiles: string[] } {
	const filesToParse = allFiles.filter((file) => extensions.includes(path.extname(file))).slice(0, 50) // 50 files max
	const remainingFiles = allFiles.filter((file) => !filesToParse.includes(file))
	return { filesToParse, remainingFiles }
}

/*
Parsing files using tree-sitter

1. Parse the file content into an AST (Abstract Syntax Tree) using the appropriate language grammar (set of rules that define how the components of a language like keywords, expressions, and statements can be combined to create valid programs).
2. Create a query using a language-specific query string, and run it against the AST's root node to capture specific syntax elements.
    - We use tag queries to identify named entities in a program, and then use a syntax capture to label the entity and its name. A notable example of this is GitHub's search-based code navigation.
	- Our custom tag queries are based on tree-sitter's default tag queries, but modified to only capture definitions.
3. Sort the captures by their position in the file, output the name of the definition, and format by i.e. adding "|----\n" for gaps between captured sections.

This approach allows us to focus on the most relevant parts of the code (defined by our language-specific queries) and provides a concise yet informative view of the file's structure and key elements.

- https://github.com/tree-sitter/node-tree-sitter/blob/master/test/query_test.js
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/test/query-test.js
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/test/helper.js
- https://tree-sitter.github.io/tree-sitter/code-navigation-systems
*/
/**
 * Parse a file and extract code definitions using tree-sitter
 *
 * @param filePath - Path to the file to parse
 * @param languageParsers - Map of language parsers
 * @param rooIgnoreController - Optional controller to check file access permissions
 * @returns A formatted string with code definitions or null if no definitions found
 */

/**
 * Process captures from tree-sitter or markdown parser
 *
 * @param captures - The captures to process
 * @param lines - The lines of the file
 * @param minComponentLines - Minimum number of lines for a component to be included
 * @returns A formatted string with definitions
 */
function processCaptures(captures: QueryCapture[], lines: string[], language: string): string | null {
	// Determine if HTML filtering is needed for this language
	const needsHtmlFiltering = ["jsx", "tsx"].includes(language)

	// Filter function to exclude HTML elements if needed
	const isNotHtmlElement = (line: string): boolean => {
		if (!needsHtmlFiltering) return true
		// Common HTML elements pattern
		const HTML_ELEMENTS = /^[^A-Z]*<\/?(?:div|span|button|input|h[1-6]|p|a|img|ul|li|form)\b/
		const trimmedLine = line.trim()
		return !HTML_ELEMENTS.test(trimmedLine)
	}

	// No definitions found
	if (captures.length === 0) {
		return null
	}

	let formattedOutput = ""

	// Sort captures by their start position
	captures.sort((a, b) => a.node.startPosition.row - b.node.startPosition.row)

	// Track already processed definitions to avoid duplicates
	// Use a more comprehensive key that includes the actual content to better detect duplicates
	const processedDefinitions = new Map<
		string,
		{ startLine: number; endLine: number; displayLine: number; priority: number }
	>()

	// Process captures and group by definition type and location
	captures.forEach((capture) => {
		const { node, name } = capture

		// Skip captures that don't represent definitions
		if (!name.includes("definition") && !name.includes("name")) {
			return
		}

		// For Java, skip certain captures to avoid duplication
		if (language === "java") {
			// Skip comment definitions
			if (name === "definition.comment") {
				return
			}

			// Skip individual interface method definitions to avoid duplication
			// The interface declaration already shows the interface with its methods
			const parent = node.parent
			const grandParent = parent?.parent
			const greatGrandParent = grandParent?.parent

			// Check if this is a method inside an interface body
			if (name.includes("method")) {
				if (
					parent?.type === "interface_body" ||
					grandParent?.type === "interface_body" ||
					greatGrandParent?.type === "interface_body"
				) {
					// Skip interface methods as they're part of the interface declaration
					return
				}
			}

			// Handle overlapping class captures
			// Skip general class definitions if we have more specific inner/nested class captures
			if (name === "definition.class" || name === "name.definition.class") {
				const nodeStartRow = node.startPosition.row

				// Check if this class is inside another class body (making it an inner/nested class)
				let currentParent = parent
				while (currentParent) {
					if (currentParent.type === "class_body") {
						// This is a nested class, check if we have a more specific capture
						const hasSpecificCapture = captures.some(
							(c) =>
								(c.name === "definition.inner_class" ||
									c.name === "name.definition.inner_class" ||
									c.name === "definition.static_nested_class" ||
									c.name === "name.definition.static_nested_class") &&
								Math.abs(c.node.startPosition.row - nodeStartRow) <= 1,
						)
						if (hasSpecificCapture) {
							return // Skip this general capture in favor of the specific one
						}
						break
					}
					currentParent = currentParent.parent
				}
			}

			// Skip duplicate inner/static nested class captures
			// Keep only the most specific one
			if (name === "definition.inner_class" || name === "definition.static_nested_class") {
				const nodeStartRow = node.startPosition.row
				// Check if we already have a class definition at this location
				const hasGeneralClass = captures.some(
					(c) =>
						(c.name === "definition.class" || c.name === "name.definition.class") &&
						Math.abs(c.node.startPosition.row - nodeStartRow) <= 1,
				)
				// If we have both, we'll keep this specific one and the general one will be skipped above
			}
		}

		// Get the parent node that contains the full definition
		const definitionNode = name.includes("name") && node.parent ? node.parent : node
		if (!definitionNode) return

		// Get the start and end lines of the full definition
		const startLine = definitionNode.startPosition.row
		const endLine = definitionNode.endPosition.row
		const lineCount = endLine - startLine + 1

		// Skip components that don't span enough lines
		if (lineCount < getMinComponentLines()) {
			return
		}

		// Determine the line to display (for Java definitions with annotations, find the actual declaration line)
		let displayLine = startLine
		if (language === "java") {
			// For methods, classes, interfaces, etc. with annotations, find the actual declaration line
			for (let i = startLine; i <= endLine; i++) {
				const line = lines[i]?.trim() || ""
				// Skip empty lines, annotations, and comments
				if (
					line &&
					!line.startsWith("@") &&
					!line.startsWith("//") &&
					!line.startsWith("/*") &&
					!line.startsWith("*")
				) {
					displayLine = i
					break
				}
			}
		}

		// Check if this is a valid component definition (not an HTML element)
		const displayLineContent = lines[displayLine]?.trim() || ""
		if (!isNotHtmlElement(displayLineContent)) {
			return
		}

		// Create a unique key for this definition based on location and content
		// This helps prevent duplicates when the same definition is captured multiple times
		const defKey = `${startLine}-${endLine}-${displayLineContent.substring(0, 50)}`

		// Assign priority based on capture type (more specific captures have higher priority)
		let priority = 0
		if (name.includes("inner_class") || name.includes("static_nested_class")) {
			priority = 3
		} else if (name.includes("method") || name.includes("constructor")) {
			priority = 2
		} else if (
			name.includes("class") ||
			name.includes("interface") ||
			name.includes("enum") ||
			name.includes("record")
		) {
			priority = 1
		}

		// Check if we've already processed a definition at this location
		const existing = processedDefinitions.get(defKey)
		if (existing) {
			// Keep the capture with higher priority (more specific)
			if (priority > existing.priority) {
				processedDefinitions.set(defKey, { startLine, endLine, displayLine, priority })
			}
			return
		}

		// Store this definition
		processedDefinitions.set(defKey, { startLine, endLine, displayLine, priority })
	})

	// Generate output from processed definitions
	const sortedDefinitions = Array.from(processedDefinitions.values()).sort((a, b) => a.startLine - b.startLine)

	for (const def of sortedDefinitions) {
		formattedOutput += `${def.startLine + 1}--${def.endLine + 1} | ${lines[def.displayLine]}\n`
	}

	if (formattedOutput.length > 0) {
		return formattedOutput
	}

	return null
}

/**
 * Parse a file and extract code definitions using tree-sitter
 *
 * @param filePath - Path to the file to parse
 * @param languageParsers - Map of language parsers
 * @param rooIgnoreController - Optional controller to check file access permissions
 * @returns A formatted string with code definitions or null if no definitions found
 */
async function parseFile(
	filePath: string,
	languageParsers: LanguageParser,
	rooIgnoreController?: RooIgnoreController,
): Promise<string | null> {
	// Check if we have permission to access this file
	if (rooIgnoreController && !rooIgnoreController.validateAccess(filePath)) {
		return null
	}

	// Read file content
	const fileContent = await fs.readFile(filePath, "utf8")
	const extLang = path.extname(filePath).toLowerCase().slice(1)

	// Check if we have a parser for this file type
	const { parser, query } = languageParsers[extLang] || {}
	if (!parser || !query) {
		return `Unsupported file type: ${filePath}`
	}

	try {
		// Parse the file content into an Abstract Syntax Tree (AST)
		const tree = parser.parse(fileContent)

		// Apply the query to the AST and get the captures
		const captures = tree ? query.captures(tree.rootNode) : []

		// Split the file content into individual lines
		const lines = fileContent.split("\n")

		// Process the captures
		return processCaptures(captures, lines, extLang)
	} catch (error) {
		console.log(`Error parsing file: ${error}\n`)
		// Return null on parsing error to avoid showing error messages in the output
		return null
	}
}
