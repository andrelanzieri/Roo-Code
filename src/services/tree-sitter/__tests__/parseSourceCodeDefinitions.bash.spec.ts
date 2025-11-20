/*
TODO: The following structures can be parsed by tree-sitter but lack query support:

1. Process Substitution:
   (process_substitution)
   Example: diff <(command1) <(command2)

2. Coprocess:
   (coproc_statement)
   Example: coproc NAME { command; }

3. Compound Commands:
   (compound_statement)
   Example: { command1; command2; }

4. Select Loops:
   (select_statement)
   Example: select item in list; do ...; done

5. Extended Glob Patterns:
   (extglob_pattern)
   Example: !(pattern), ?(pattern), *(pattern), +(pattern), @(pattern)
*/

import { testParseSourceCodeDefinitions, debugLog } from "./helpers"
import { sampleBashContent } from "./fixtures/sample-bash"
import { bashQuery } from "../queries"

// Bash test options
const bashOptions = {
	language: "bash",
	wasmFile: "tree-sitter-bash.wasm",
	queryString: bashQuery,
	extKey: "sh",
}

describe("parseSourceCodeDefinitionsForFile with Bash", () => {
	let parseResult: string | undefined

	beforeAll(async () => {
		// Cache parse result for all tests
		parseResult = await testParseSourceCodeDefinitions("test.sh", sampleBashContent, bashOptions)
		debugLog("Bash Parse Result:", parseResult)
	})

	it("should parse function definitions", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| function multi_line_function\(\)/)
		expect(parseResult).toMatch(/\d+--\d+ \| another_function\(\)/)
		expect(parseResult).toMatch(/\d+--\d+ \| calculate_sum\(\)/)
		debugLog("Function definitions found:", parseResult)
	})

	it("should parse variable declarations and exports", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| GLOBAL_VAR="global_value"/)
		expect(parseResult).toMatch(/\d+--\d+ \| export PATH_VAR/)
		expect(parseResult).toMatch(/\d+--\d+ \| readonly CONSTANT_VAR/)
		expect(parseResult).toMatch(/\d+--\d+ \| declare -a array_var/)
		debugLog("Variable declarations found:", parseResult)
	})

	it("should parse alias definitions", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| alias ll='ls -la'/)
		expect(parseResult).toMatch(/\d+--\d+ \| alias grep='grep --color=auto'/)
		debugLog("Alias definitions found:", parseResult)
	})

	it("should parse control structures", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| case "\$1" in/)
		expect(parseResult).toMatch(/\d+--\d+ \| if \[\[ -f "\$CONFIG_FILE"/)
		expect(parseResult).toMatch(/\d+--\d+ \| while IFS= read/)
		expect(parseResult).toMatch(/\d+--\d+ \| for element in/)
		debugLog("Control structures found:", parseResult)
	})

	it("should parse here documents and redirections", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| cat <<EOF/)
		expect(parseResult).toMatch(/\d+--\d+ \| cat data.txt/)
		debugLog("Here documents and redirections found:", parseResult)
	})

	it("should parse source commands", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| source \.\/config.sh/)
		expect(parseResult).toMatch(/\d+--\d+ \| \. \.\/utils.sh/)
		debugLog("Source commands found:", parseResult)
	})

	it("should parse test commands", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| if \[ -z "\$VAR" \]/)
		expect(parseResult).toMatch(/\d+--\d+ \| if \[\[ "\$VAR" =~ \^/)
		debugLog("Test commands found:", parseResult)
	})

	it("should parse arithmetic operations", () => {
		expect(parseResult).toMatch(/\d+--\d+ \|.*\$\(\(/)
		debugLog("Arithmetic operations found:", parseResult)
	})

	it("should parse shebang", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| #!\/bin\/bash/)
		debugLog("Shebang found:", parseResult)
	})
})
