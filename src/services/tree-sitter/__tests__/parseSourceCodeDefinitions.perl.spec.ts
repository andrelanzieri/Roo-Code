import { describe, it, expect, beforeAll } from "vitest"
import * as path from "path"
import * as fs from "fs/promises"
import { parseSourceCodeDefinitionsForFile } from "../index"
import { samplePerl } from "./fixtures/sample-perl"

describe("parseSourceCodeDefinitions - Perl", () => {
	const testFilePath = path.join(__dirname, "test-perl-file.pl")

	beforeAll(async () => {
		await fs.writeFile(testFilePath, samplePerl, "utf8")
	})

	it("should parse Perl package declarations", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("package MyModule")
		expect(result).toContain("package MyModule::Utils")
	})

	it("should parse Perl subroutine definitions", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("sub calculate_sum")
		expect(result).toContain("sub new")
		expect(result).toContain("sub process_data")
		expect(result).toContain("sub modify_global")
	})

	it("should parse Perl special blocks", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("BEGIN")
		expect(result).toContain("END")
		expect(result).toContain("AUTOLOAD")
	})

	it("should parse Perl constants", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("use constant PI")
		expect(result).toContain("use constant DEBUG")
	})

	it("should parse Perl use statements", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("use strict")
		expect(result).toContain("use warnings")
		expect(result).toContain("use Data::Dumper")
	})

	it("should parse Perl variable declarations", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("our $VERSION")
		expect(result).toContain("our @EXPORT")
		expect(result).toContain("state $counter")
		expect(result).toContain("my $validator")
	})

	it("should parse Perl format declarations", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("format REPORT")
	})

	it("should parse Perl labels", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("MAIN_LOOP:")
	})

	it("should parse Perl require statements", async () => {
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("require Exporter")
	})

	it("should handle .pm files", async () => {
		const pmFilePath = path.join(__dirname, "test-perl-module.pm")
		await fs.writeFile(pmFilePath, samplePerl, "utf8")
		const result = await parseSourceCodeDefinitionsForFile(pmFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("package MyModule")
	})

	it("should handle .pod files", async () => {
		const podFilePath = path.join(__dirname, "test-perl-doc.pod")
		const podContent = `
=head1 NAME

Test::Module - A test module

=head1 DESCRIPTION

This is a test POD file.

=cut
`
		await fs.writeFile(podFilePath, podContent, "utf8")
		const result = await parseSourceCodeDefinitionsForFile(podFilePath)
		// POD files might not have code definitions, but should be parseable
		expect(result).toBeDefined()
	})

	it("should handle .t test files", async () => {
		const testFilePath = path.join(__dirname, "test-perl-test.t")
		const testContent = `#!/usr/bin/perl
use Test::More tests => 2;

sub test_function {
    return 42;
}

ok(1, "Test passes");
is(test_function(), 42, "Function returns 42");
`
		await fs.writeFile(testFilePath, testContent, "utf8")
		const result = await parseSourceCodeDefinitionsForFile(testFilePath)
		expect(result).toBeDefined()
		expect(result).toContain("sub test_function")
	})

	// Clean up test files
	afterAll(async () => {
		const filesToClean = [
			testFilePath,
			path.join(__dirname, "test-perl-module.pm"),
			path.join(__dirname, "test-perl-doc.pod"),
			path.join(__dirname, "test-perl-test.t"),
		]
		for (const file of filesToClean) {
			try {
				await fs.unlink(file)
			} catch {
				// File might not exist, ignore
			}
		}
	})
})
