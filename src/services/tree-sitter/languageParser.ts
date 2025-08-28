import * as path from "path"
import { Parser as ParserT, Language as LanguageT, Query as QueryT } from "web-tree-sitter"
import {
	javascriptQuery,
	typescriptQuery,
	tsxQuery,
	pythonQuery,
	rustQuery,
	goQuery,
	cppQuery,
	cQuery,
	csharpQuery,
	rubyQuery,
	javaQuery,
	phpQuery,
	htmlQuery,
	swiftQuery,
	kotlinQuery,
	cssQuery,
	ocamlQuery,
	solidityQuery,
	tomlQuery,
	vueQuery,
	luaQuery,
	systemrdlQuery,
	tlaPlusQuery,
	zigQuery,
	embeddedTemplateQuery,
	elispQuery,
	elixirQuery,
} from "./queries"

export interface LanguageParser {
	[key: string]: {
		parser: ParserT
		query: QueryT
	}
}

async function loadLanguage(langName: string, sourceDirectory?: string) {
	const baseDir = sourceDirectory || __dirname
	const wasmPath = path.join(baseDir, `tree-sitter-${langName}.wasm`)

	try {
		const { Language } = require("web-tree-sitter")
		return await Language.load(wasmPath)
	} catch (error) {
		console.error(`Error loading language: ${wasmPath}: ${error instanceof Error ? error.message : error}`)
		throw error
	}
}

let isParserInitialized = false

// Global cache for parser instances to avoid recreating them
const parserInstanceCache: Map<string, ParserT> = new Map()
// Global cache for loaded languages to avoid reloading WASM files
const languageCache: Map<string, LanguageT> = new Map()

/*
Using node bindings for tree-sitter is problematic in vscode extensions 
because of incompatibility with electron. Going the .wasm route has the 
advantage of not having to build for multiple architectures.

We use web-tree-sitter and tree-sitter-wasms which provides auto-updating
prebuilt WASM binaries for tree-sitter's language parsers.

This function loads WASM modules for relevant language parsers based on input files:
1. Extracts unique file extensions
2. Maps extensions to language names
3. Loads corresponding WASM files (containing grammar rules)
4. Uses WASM modules to initialize tree-sitter parsers

This approach optimizes performance by loading only necessary parsers once for all relevant files.

Sources:
- https://github.com/tree-sitter/node-tree-sitter/issues/169
- https://github.com/tree-sitter/node-tree-sitter/issues/168
- https://github.com/Gregoor/tree-sitter-wasms/blob/main/README.md
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md
- https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/test/query-test.js
*/
export async function loadRequiredLanguageParsers(filesToParse: string[], sourceDirectory?: string) {
	const { Parser, Query } = require("web-tree-sitter")

	if (!isParserInitialized) {
		try {
			await Parser.init()
			isParserInitialized = true
		} catch (error) {
			console.error(`Error initializing parser: ${error instanceof Error ? error.message : error}`)
			throw error
		}
	}

	const extensionsToLoad = new Set(filesToParse.map((file) => path.extname(file).toLowerCase().slice(1)))
	const parsers: LanguageParser = {}

	for (const ext of extensionsToLoad) {
		let language: LanguageT
		let query: QueryT
		let parserKey = ext // Default to using extension as key

		// Determine the language name for caching
		let languageName: string
		let queryString: string

		switch (ext) {
			case "js":
			case "jsx":
			case "json":
				languageName = "javascript"
				queryString = javascriptQuery
				break
			case "ts":
				languageName = "typescript"
				queryString = typescriptQuery
				break
			case "tsx":
				languageName = "tsx"
				queryString = tsxQuery
				break
			case "py":
				languageName = "python"
				queryString = pythonQuery
				break
			case "rs":
				languageName = "rust"
				queryString = rustQuery
				break
			case "go":
				languageName = "go"
				queryString = goQuery
				break
			case "cpp":
			case "hpp":
				languageName = "cpp"
				queryString = cppQuery
				break
			case "c":
			case "h":
				languageName = "c"
				queryString = cQuery
				break
			case "cs":
				languageName = "c_sharp"
				queryString = csharpQuery
				break
			case "rb":
				languageName = "ruby"
				queryString = rubyQuery
				break
			case "java":
				languageName = "java"
				queryString = javaQuery
				break
			case "php":
				languageName = "php"
				queryString = phpQuery
				break
			case "swift":
				languageName = "swift"
				queryString = swiftQuery
				break
			case "kt":
			case "kts":
				languageName = "kotlin"
				queryString = kotlinQuery
				break
			case "css":
				languageName = "css"
				queryString = cssQuery
				break
			case "html":
				languageName = "html"
				queryString = htmlQuery
				break
			case "ml":
			case "mli":
				languageName = "ocaml"
				queryString = ocamlQuery
				break
			case "scala":
				languageName = "scala"
				queryString = luaQuery // Temporarily use Lua query until Scala is implemented
				break
			case "sol":
				languageName = "solidity"
				queryString = solidityQuery
				break
			case "toml":
				languageName = "toml"
				queryString = tomlQuery
				break
			case "vue":
				languageName = "vue"
				queryString = vueQuery
				break
			case "lua":
				languageName = "lua"
				queryString = luaQuery
				break
			case "rdl":
				languageName = "systemrdl"
				queryString = systemrdlQuery
				break
			case "tla":
				languageName = "tlaplus"
				queryString = tlaPlusQuery
				break
			case "zig":
				languageName = "zig"
				queryString = zigQuery
				break
			case "ejs":
			case "erb":
				parserKey = "embedded_template" // Use same key for both extensions.
				languageName = "embedded_template"
				queryString = embeddedTemplateQuery
				break
			case "el":
				languageName = "elisp"
				queryString = elispQuery
				break
			case "ex":
			case "exs":
				languageName = "elixir"
				queryString = elixirQuery
				break
			default:
				throw new Error(`Unsupported language: ${ext}`)
		}

		// Load language from cache or load it fresh
		if (languageCache.has(languageName)) {
			language = languageCache.get(languageName)!
		} else {
			language = await loadLanguage(languageName, sourceDirectory)
			languageCache.set(languageName, language)
		}

		// Create query
		query = new Query(language, queryString)

		// Reuse parser instance from cache or create new one
		let parser: ParserT
		if (parserInstanceCache.has(languageName)) {
			parser = parserInstanceCache.get(languageName)!
		} else {
			parser = new Parser()
			parser.setLanguage(language)
			parserInstanceCache.set(languageName, parser)
		}

		parsers[parserKey] = { parser, query }
	}

	return parsers
}
