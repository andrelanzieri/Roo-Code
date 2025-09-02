// npx vitest services/tree-sitter/__tests__/parseSourceCodeDefinitions.perl.spec.ts

import { testParseSourceCodeDefinitions, debugLog } from "./helpers"
import { samplePerlContent } from "./fixtures/sample-perl"
import { perlQuery } from "../queries"

// Perl test options
const perlOptions = {
	language: "perl",
	wasmFile: "tree-sitter-perl.wasm",
	queryString: perlQuery,
	extKey: "pl",
}

describe("parseSourceCodeDefinitionsForFile with Perl", () => {
	let parseResult: string | undefined

	beforeAll(async () => {
		// Cache parse result for all tests
		parseResult = await testParseSourceCodeDefinitions("test.pl", samplePerlContent, perlOptions)
		debugLog("Perl Parse Result:", parseResult)
	})

	it("should parse subroutine definitions", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| sub calculate_total \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| sub add_numbers \(\$\$\) \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| sub modern_function \(\$name, \$age = 18, @hobbies\) \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| my \$validator = sub \{/)
		debugLog("Subroutine definitions found:", parseResult)
	})

	it("should parse package and module declarations", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| package MyApp::Utils v1\.2\.3;/)
		expect(parseResult).toMatch(/\d+--\d+ \| package MyApp::Model::User \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| package MyApp::Model::Post \{/)
		debugLog("Package declarations found:", parseResult)
	})

	it("should parse use and require statements", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| use strict;/)
		expect(parseResult).toMatch(/\d+--\d+ \| use warnings;/)
		expect(parseResult).toMatch(/\d+--\d+ \| use List::Util qw\(sum max min\);/)
		expect(parseResult).toMatch(/\d+--\d+ \| use Moose;/)
		debugLog("Import statements found:", parseResult)
	})

	it("should parse OO constructs and Moose attributes", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| sub new \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| has 'username' => \(/)
		expect(parseResult).toMatch(/\d+--\d+ \| has 'email' => \(/)
		expect(parseResult).toMatch(/\d+--\d+ \| before 'save' => sub \{/)
		debugLog("OO constructs found:", parseResult)
	})

	it("should parse role definitions", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| package MyApp::Role::Timestamped \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| with 'MyApp::Role::Timestamped';/)
		debugLog("Role definitions found:", parseResult)
	})

	it("should parse special blocks", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| BEGIN \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| END \{/)
		debugLog("Special blocks found:", parseResult)
	})

	it("should parse variable declarations", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| my \$email_regex = qr/)
		expect(parseResult).toMatch(/\d+--\d+ \| my \$config = <<'END_CONFIG';/)
		expect(parseResult).toMatch(/\d+--\d+ \| state \$count = 0;/)
		expect(parseResult).toMatch(/\d+--\d+ \| my %user_permissions = \(/)
		debugLog("Variable declarations found:", parseResult)
	})

	it("should parse constants", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| use constant \{/)
		expect(parseResult).toMatch(/MAX_RETRIES => 3/)
		expect(parseResult).toMatch(/TIMEOUT\s+=> 30/)
		debugLog("Constants found:", parseResult)
	})

	it("should parse regex patterns and operations", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| if \(\$line =~ /)
		expect(parseResult).toMatch(/\d+--\d+ \| \$text =~ s\/<\[\^>\]\+>\/\/g;/)
		expect(parseResult).toMatch(/\d+--\d+ \| \$text =~ tr\/A-Z\/a-z\/;/)
		debugLog("Regex patterns found:", parseResult)
	})

	it("should parse exception handling", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| eval \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| try \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| } catch \{/)
		expect(parseResult).toMatch(/\d+--\d+ \| } finally \{/)
		debugLog("Exception handling found:", parseResult)
	})

	it("should parse given/when statements", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| given \(\$user_type\) \{/)
		expect(parseResult).toMatch(/\d+--\d+ \|     when \('admin'\) \{/)
		expect(parseResult).toMatch(/\d+--\d+ \|     default \{/)
		debugLog("Given/when statements found:", parseResult)
	})

	it("should parse format declarations", () => {
		expect(parseResult).toMatch(/\d+--\d+ \| format REPORT =/)
		debugLog("Format declarations found:", parseResult)
	})
})
