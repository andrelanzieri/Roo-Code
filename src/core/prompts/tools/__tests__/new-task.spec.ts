import { getNewTaskDescription } from "../new-task"
import { ToolArgs } from "../types"

describe("getNewTaskDescription", () => {
	it("should NOT show todos parameter at all when setting is disabled", () => {
		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: {
				newTaskRequireTodos: false,
			},
		}

		const description = getNewTaskDescription(args)

		// Check that todos parameter is NOT shown at all
		expect(description).not.toContain("todos:")
		expect(description).not.toContain("todos parameter")
		expect(description).not.toContain("The initial todo list in markdown checklist format")

		// Should have a simple example without todos
		expect(description).toContain("Implement a new feature for the application")

		// Should NOT have any todos parameter in examples
		expect(description).not.toContain('<parameter name="todos">')
		expect(description).not.toContain("[ ] First task to complete")

		// Should still have mode and message as required
		expect(description).toContain("mode: (required)")
		expect(description).toContain("message: (required)")
	})

	it("should show todos as required when setting is enabled", () => {
		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: {
				newTaskRequireTodos: true,
			},
		}

		const description = getNewTaskDescription(args)

		// Check that todos is marked as required
		expect(description).toContain("todos: (required)")
		expect(description).toContain("and initial todo list")
		expect(description).toContain("The initial todo list in markdown checklist format")

		// Should not contain any mention of optional for todos
		expect(description).not.toContain("todos: (optional)")
		expect(description).not.toContain("optional initial todo list")

		// Should include todos in the example
		expect(description).toContain('<parameter name="todos">')
		expect(description).toContain("</parameter>")
		expect(description).toContain("Set up auth middleware")
	})

	it("should NOT show todos parameter when settings is undefined", () => {
		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: undefined,
		}

		const description = getNewTaskDescription(args)

		// Check that todos parameter is NOT shown by default
		expect(description).not.toContain("todos:")
		expect(description).not.toContain("The initial todo list in markdown checklist format")
		expect(description).not.toContain('<parameter name="todos">')
		expect(description).not.toContain("[ ] First task to complete")
	})

	it("should NOT show todos parameter when newTaskRequireTodos is undefined", () => {
		const args: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: {},
		}

		const description = getNewTaskDescription(args)

		// Check that todos parameter is NOT shown by default
		expect(description).not.toContain("todos:")
		expect(description).not.toContain("The initial todo list in markdown checklist format")
		expect(description).not.toContain('<parameter name="todos">')
		expect(description).not.toContain("[ ] First task to complete")
	})

	it("should include todos in examples only when setting is enabled", () => {
		const argsWithSettingOff: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: {
				newTaskRequireTodos: false,
			},
		}

		const argsWithSettingOn: ToolArgs = {
			cwd: "/test",
			supportsComputerUse: false,
			settings: {
				newTaskRequireTodos: true,
			},
		}

		const descriptionOff = getNewTaskDescription(argsWithSettingOff)
		const descriptionOn = getNewTaskDescription(argsWithSettingOn)

		// When setting is on, should include todos in main example
		expect(descriptionOn).toContain("Implement user authentication")
		expect(descriptionOn).toContain("[ ] Set up auth middleware")
		expect(descriptionOn).toContain('<parameter name="todos">')
		expect(descriptionOn).toContain("</parameter>")

		// When setting is off, should NOT include any todos references
		expect(descriptionOff).not.toContain('<parameter name="todos">')
		expect(descriptionOff).not.toContain("[ ] Set up auth middleware")
		expect(descriptionOff).not.toContain("[ ] First task to complete")

		// When setting is off, main example should be simple
		const usagePattern =
			/<invoke name="new_task">\s*<parameter name="mode">.*<\/parameter>\s*<parameter name="message">.*<\/parameter>\s*<\/invoke>/s
		expect(descriptionOff).toMatch(usagePattern)
	})
})
