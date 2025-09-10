import { getBuiltInCommands, getBuiltInCommand, getBuiltInCommandNames } from "../built-in-commands"

describe("Built-in Commands", () => {
	describe("getBuiltInCommands", () => {
		it("should return all built-in commands", async () => {
			const commands = await getBuiltInCommands()

			expect(commands).toHaveLength(2)
			expect(commands.map((cmd) => cmd.name)).toEqual(expect.arrayContaining(["init", "review"]))

			// Verify all commands have required properties
			commands.forEach((command) => {
				expect(command.name).toBeDefined()
				expect(typeof command.name).toBe("string")
				expect(command.content).toBeDefined()
				expect(typeof command.content).toBe("string")
				expect(command.source).toBe("built-in")
				expect(command.filePath).toMatch(/^<built-in:.+>$/)
				expect(command.description).toBeDefined()
				expect(typeof command.description).toBe("string")
			})
		})

		it("should return commands with proper content", async () => {
			const commands = await getBuiltInCommands()

			const initCommand = commands.find((cmd) => cmd.name === "init")
			expect(initCommand).toBeDefined()
			expect(initCommand!.content).toContain("AGENTS.md")
			expect(initCommand!.content).toContain(".roo/rules-")
			expect(initCommand!.description).toBe(
				"Analyze codebase and create concise AGENTS.md files for AI assistants",
			)

			const reviewCommand = commands.find((cmd) => cmd.name === "review")
			expect(reviewCommand).toBeDefined()
			expect(reviewCommand!.content).toContain("Review implementation changes")
			expect(reviewCommand!.content).toContain("github issue")
			expect(reviewCommand!.description).toBe(
				"Review implementation changes against original requirements before creating a pull request",
			)
			expect(reviewCommand!.argumentHint).toBe("[context]")
		})
	})

	describe("getBuiltInCommand", () => {
		it("should return specific built-in command by name", async () => {
			const initCommand = await getBuiltInCommand("init")

			expect(initCommand).toBeDefined()
			expect(initCommand!.name).toBe("init")
			expect(initCommand!.source).toBe("built-in")
			expect(initCommand!.filePath).toBe("<built-in:init>")
			expect(initCommand!.content).toContain("AGENTS.md")
			expect(initCommand!.description).toBe(
				"Analyze codebase and create concise AGENTS.md files for AI assistants",
			)
		})

		it("should return review command by name", async () => {
			const reviewCommand = await getBuiltInCommand("review")

			expect(reviewCommand).toBeDefined()
			expect(reviewCommand!.name).toBe("review")
			expect(reviewCommand!.source).toBe("built-in")
			expect(reviewCommand!.filePath).toBe("<built-in:review>")
			expect(reviewCommand!.content).toContain("Review implementation changes")
			expect(reviewCommand!.description).toBe(
				"Review implementation changes against original requirements before creating a pull request",
			)
			expect(reviewCommand!.argumentHint).toBe("[context]")
		})

		it("should return undefined for non-existent command", async () => {
			const nonExistentCommand = await getBuiltInCommand("non-existent")
			expect(nonExistentCommand).toBeUndefined()
		})

		it("should handle empty string command name", async () => {
			const emptyCommand = await getBuiltInCommand("")
			expect(emptyCommand).toBeUndefined()
		})
	})

	describe("getBuiltInCommandNames", () => {
		it("should return all built-in command names", async () => {
			const names = await getBuiltInCommandNames()

			expect(names).toHaveLength(2)
			expect(names).toEqual(expect.arrayContaining(["init", "review"]))
			// Order doesn't matter since it's based on filesystem order
			expect(names.sort()).toEqual(["init", "review"])
		})

		it("should return array of strings", async () => {
			const names = await getBuiltInCommandNames()

			names.forEach((name) => {
				expect(typeof name).toBe("string")
				expect(name.length).toBeGreaterThan(0)
			})
		})
	})

	describe("Command Content Validation", () => {
		it("init command should have comprehensive content", async () => {
			const command = await getBuiltInCommand("init")
			const content = command!.content

			// Should contain key sections
			expect(content).toContain("Please analyze this codebase")
			expect(content).toContain("Build/lint/test commands")
			expect(content).toContain("Code style guidelines")
			expect(content).toContain("non-obvious")
			expect(content).toContain("discovered by reading files")

			// Should mention important concepts
			expect(content).toContain("AGENTS.md")
			expect(content).toContain(".roo/rules-")
			expect(content).toContain("rules-code")
			expect(content).toContain("rules-debug")
			expect(content).toContain("rules-ask")
			expect(content).toContain("rules-architect")
		})

		it("review command should have comprehensive content", async () => {
			const command = await getBuiltInCommand("review")
			const content = command!.content

			// Should contain key sections
			expect(content).toContain("Review implementation changes against original requirements")
			expect(content).toContain("Parse Command Arguments")
			expect(content).toContain("Initialize Review Process")
			expect(content).toContain("Gather Context Information")
			expect(content).toContain("Generate Comprehensive Diff")
			expect(content).toContain("Analyze Implementation Against Requirements")

			// Should mention important concepts
			expect(content).toContain("github issue")
			expect(content).toContain("slack comment")
			expect(content).toContain("github comment")
			expect(content).toContain("git diff")
			expect(content).toContain("Requirement Coverage")
			expect(content).toContain("Code Quality")
			expect(content).toContain("Security Considerations")
			expect(content).toContain("Confidence Score")
			expect(content).toContain("attempt_completion")
		})
	})
})
