import { describe, it, expect } from "vitest"
import { repairBrokenXml, hasBrokenXmlPattern } from "../xml-repair"

describe("xml-repair", () => {
	describe("hasBrokenXmlPattern", () => {
		it("should detect broken tool opening tags", () => {
			const brokenXml = "read_file>\n<args>\n</args>\n</read_file>"
			expect(hasBrokenXmlPattern(brokenXml)).toBe(true)
		})

		it("should detect broken parameter opening tags", () => {
			const brokenXml = "<read_file>\nargs>\n</args>\n</read_file>"
			expect(hasBrokenXmlPattern(brokenXml)).toBe(true)
		})

		it("should detect broken closing tags", () => {
			const brokenXml = "<read_file>\n<args>\n/args>\n/read_file>"
			expect(hasBrokenXmlPattern(brokenXml)).toBe(true)
		})

		it("should not detect valid XML as broken", () => {
			const validXml = "<read_file>\n<args>\n</args>\n</read_file>"
			expect(hasBrokenXmlPattern(validXml)).toBe(false)
		})
	})

	describe("repairBrokenXml", () => {
		it("should repair missing opening brackets for tool tags", () => {
			const brokenXml = "read_file>\n<args>\n</args>\n/read_file>"
			const expected = "<read_file>\n<args>\n</args>\n</read_file>"
			expect(repairBrokenXml(brokenXml)).toBe(expected)
		})

		it("should repair missing opening brackets for parameter tags", () => {
			const brokenXml = "<read_file>\nargs>\n/args>\n</read_file>"
			const expected = "<read_file>\n<args>\n</args>\n</read_file>"
			expect(repairBrokenXml(brokenXml)).toBe(expected)
		})

		it("should handle the example from the issue", () => {
			// This is the exact example from the issue
			const brokenXml = "read_file>\nargs>\n<file>\n<path>main.gopath>\n</file>\nargs>\nread_file>"
			const expected = "<read_file>\n<args>\n<file>\n<path>main.go</path>\n</file>\n</args>\n</read_file>"
			expect(repairBrokenXml(brokenXml)).toBe(expected)
		})

		it("should not modify valid XML", () => {
			const validXml = "<write_to_file>\n<path>test.txt</path>\n</write_to_file>"
			expect(repairBrokenXml(validXml)).toBe(validXml)
		})

		it("should handle execute_command with broken tags", () => {
			const brokenXml = "execute_command>\n<command>test</command>\n/execute_command>"
			const expected = "<execute_command>\n<command>test</command>\n</execute_command>"
			expect(repairBrokenXml(brokenXml)).toBe(expected)
		})

		it("should handle search_files with broken tags", () => {
			const brokenXml = "search_files>\n<path>src</path>\nregex>pattern</regex>\n/search_files>"
			const expected = "<search_files>\n<path>src</path>\n<regex>pattern</regex>\n</search_files>"
			expect(repairBrokenXml(brokenXml)).toBe(expected)
		})
	})
})
