import { describe, it, expect } from "vitest"
import { parseCommand, isCompoundCommand, splitCompoundCommand } from "../commandParser"

describe("commandParser", () => {
	describe("parseCommand", () => {
		it("should identify simple commands as non-compound", () => {
			const result = parseCommand("ls -la")
			expect(result.isCompound).toBe(false)
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe("ls -la")
			expect(result.segments[0].operator).toBeUndefined()
		})

		it("should parse && operator correctly", () => {
			const result = parseCommand("cd foo && npm test")
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("cd foo")
			expect(result.segments[0].operator).toBe("&&")
			expect(result.segments[1].command).toBe("npm test")
			expect(result.segments[1].operator).toBeUndefined()
		})

		it("should parse || operator correctly", () => {
			const result = parseCommand("npm test || echo 'Tests failed'")
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("npm test")
			expect(result.segments[0].operator).toBe("||")
			expect(result.segments[1].command).toBe("echo 'Tests failed'")
		})

		it("should parse semicolon operator correctly", () => {
			const result = parseCommand("echo 'Starting'; npm test; echo 'Done'")
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(3)
			expect(result.segments[0].command).toBe("echo 'Starting'")
			expect(result.segments[0].operator).toBe(";")
			expect(result.segments[1].command).toBe("npm test")
			expect(result.segments[1].operator).toBe(";")
			expect(result.segments[2].command).toBe("echo 'Done'")
			expect(result.segments[2].operator).toBeUndefined()
		})

		it("should parse pipe operator correctly", () => {
			const result = parseCommand("ls -la | grep test")
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("ls -la")
			expect(result.segments[0].operator).toBe("|")
			expect(result.segments[1].command).toBe("grep test")
		})

		it("should handle mixed operators", () => {
			const result = parseCommand("cd app && npm install || echo 'Install failed'; npm test")
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(4)
			expect(result.segments[0].operator).toBe("&&")
			expect(result.segments[1].operator).toBe("||")
			expect(result.segments[2].operator).toBe(";")
			expect(result.segments[3].operator).toBeUndefined()
		})

		it("should respect single quotes", () => {
			const result = parseCommand("echo 'test && test'")
			expect(result.isCompound).toBe(false)
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe("echo 'test && test'")
		})

		it("should respect double quotes", () => {
			const result = parseCommand('echo "test || test"')
			expect(result.isCompound).toBe(false)
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe('echo "test || test"')
		})

		it("should handle escaped characters", () => {
			const result = parseCommand("echo test \\&& echo test2")
			expect(result.isCompound).toBe(false)
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe("echo test \\&& echo test2")
		})

		it("should handle complex quoted strings", () => {
			const result = parseCommand(`echo "It's a test" && echo 'He said "hello"'`)
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe(`echo "It's a test"`)
			expect(result.segments[1].command).toBe(`echo 'He said "hello"'`)
		})

		it("should handle empty segments gracefully", () => {
			const result = parseCommand("&& npm test")
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe("npm test")
		})

		it("should handle trailing operators", () => {
			const result = parseCommand("npm test &&")
			expect(result.segments).toHaveLength(1)
			expect(result.segments[0].command).toBe("npm test")
			expect(result.segments[0].operator).toBe("&&")
		})
	})

	describe("isCompoundCommand", () => {
		it("should return false for simple commands", () => {
			expect(isCompoundCommand("ls -la")).toBe(false)
			expect(isCompoundCommand("npm test")).toBe(false)
			expect(isCompoundCommand("echo 'test && test'")).toBe(false)
		})

		it("should return true for compound commands", () => {
			expect(isCompoundCommand("cd foo && npm test")).toBe(true)
			expect(isCompoundCommand("npm test || echo failed")).toBe(true)
			expect(isCompoundCommand("echo start; npm test")).toBe(true)
			expect(isCompoundCommand("ls | grep test")).toBe(true)
		})
	})

	describe("splitCompoundCommand", () => {
		it("should return single segment for simple commands", () => {
			const segments = splitCompoundCommand("npm test")
			expect(segments).toHaveLength(1)
			expect(segments[0].command).toBe("npm test")
		})

		it("should split compound commands correctly", () => {
			const segments = splitCompoundCommand("cd app && npm install && npm test")
			expect(segments).toHaveLength(3)
			expect(segments[0].command).toBe("cd app")
			expect(segments[1].command).toBe("npm install")
			expect(segments[2].command).toBe("npm test")
		})
	})

	describe("CommandSegment.shouldExecute", () => {
		it("should handle && operator logic correctly", () => {
			const result = parseCommand("cmd1 && cmd2")
			const segment2 = result.segments[1]

			// Should execute if previous command succeeded (exit code 0)
			expect(segment2.shouldExecute(0)).toBe(true)
			// Should not execute if previous command failed
			expect(segment2.shouldExecute(1)).toBe(false)
			expect(segment2.shouldExecute(127)).toBe(false)
		})

		it("should handle || operator logic correctly", () => {
			const result = parseCommand("cmd1 || cmd2")
			const segment2 = result.segments[1]

			// Should not execute if previous command succeeded
			expect(segment2.shouldExecute(0)).toBe(false)
			// Should execute if previous command failed
			expect(segment2.shouldExecute(1)).toBe(true)
			expect(segment2.shouldExecute(127)).toBe(true)
		})

		it("should handle ; operator logic correctly", () => {
			const result = parseCommand("cmd1; cmd2")
			const segment2 = result.segments[1]

			// Should always execute regardless of previous exit code
			expect(segment2.shouldExecute(0)).toBe(true)
			expect(segment2.shouldExecute(1)).toBe(true)
			expect(segment2.shouldExecute(127)).toBe(true)
		})

		it("should handle | operator logic correctly", () => {
			const result = parseCommand("cmd1 | cmd2")
			const segment2 = result.segments[1]

			// Should always execute (pipes always run)
			expect(segment2.shouldExecute(0)).toBe(true)
			expect(segment2.shouldExecute(1)).toBe(true)
		})

		it("should handle first segment correctly", () => {
			const result = parseCommand("cmd1 && cmd2 || cmd3")
			const segment1 = result.segments[0]

			// First segment should always execute
			expect(segment1.shouldExecute(0)).toBe(true)
			expect(segment1.shouldExecute(1)).toBe(true)
		})
	})

	describe("edge cases", () => {
		it("should handle multiple spaces between commands and operators", () => {
			const result = parseCommand("cmd1    &&    cmd2")
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("cmd1")
			expect(result.segments[1].command).toBe("cmd2")
		})

		it("should handle tabs and other whitespace", () => {
			const result = parseCommand("cmd1\t&&\tcmd2")
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("cmd1")
			expect(result.segments[1].command).toBe("cmd2")
		})

		it("should handle complex real-world commands", () => {
			const cmd = "git add . && git commit -m 'feat: add feature' && git push origin main || echo 'Push failed'"
			const result = parseCommand(cmd)
			expect(result.isCompound).toBe(true)
			expect(result.segments).toHaveLength(4)
			expect(result.segments[0].command).toBe("git add .")
			expect(result.segments[1].command).toBe("git commit -m 'feat: add feature'")
			expect(result.segments[2].command).toBe("git push origin main")
			expect(result.segments[3].command).toBe("echo 'Push failed'")
		})

		it("should handle commands with redirections", () => {
			const result = parseCommand("echo test > file.txt && cat file.txt")
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("echo test > file.txt")
			expect(result.segments[1].command).toBe("cat file.txt")
		})

		it("should handle commands with environment variables", () => {
			const result = parseCommand("NODE_ENV=test npm test && echo $NODE_ENV")
			expect(result.segments).toHaveLength(2)
			expect(result.segments[0].command).toBe("NODE_ENV=test npm test")
			expect(result.segments[1].command).toBe("echo $NODE_ENV")
		})
	})
})
