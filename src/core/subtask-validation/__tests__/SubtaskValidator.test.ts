import { describe, it, expect, vi, beforeEach } from "vitest"
import { SubtaskValidator } from "../SubtaskValidator"
import { SubtaskValidationContext } from "../types"
import { Task } from "../../task/Task"
import { ClineMessage } from "@roo-code/types"

describe("SubtaskValidator", () => {
	let mockTask: Partial<Task>
	let validator: SubtaskValidator

	beforeEach(() => {
		// Create a mock task
		mockTask = {
			api: {
				createMessage: vi.fn().mockReturnValue({
					[Symbol.asyncIterator]: async function* () {
						yield {
							type: "text",
							text: JSON.stringify({
								isSuccessful: true,
								changesSummary: "Test changes",
								researchSummary: "Test research",
								issues: null,
								improvementSuggestions: null,
							}),
						}
					},
				}),
				getModel: vi.fn().mockReturnValue({
					id: "test-model",
					info: {},
				}),
			} as any,
			say: vi.fn(),
			clineMessages: [],
		}

		validator = new SubtaskValidator(mockTask as Task)
	})

	describe("validateSubtask", () => {
		it("should return success when validation is disabled", async () => {
			const disabledValidator = new SubtaskValidator(mockTask as Task, { enabled: false })

			const context: SubtaskValidationContext = {
				parentObjective: "Test parent objective",
				subtaskInstructions: "Test subtask",
				subtaskMessages: [],
				filesBeforeSubtask: new Map(),
				orchestratorMode: "code",
			}

			const result = await disabledValidator.validateSubtask(context)

			expect(result.isSuccessful).toBe(true)
			expect(result.changesSummary).toContain("Completed subtask")
		})

		it("should validate subtask and return success result", async () => {
			const context: SubtaskValidationContext = {
				parentObjective: "Build a feature",
				subtaskInstructions: "Create a component",
				subtaskMessages: [
					{
						ts: Date.now(),
						type: "say",
						say: "completion_result",
						text: "Component created successfully",
					} as ClineMessage,
				],
				filesBeforeSubtask: new Map(),
				orchestratorMode: "code",
			}

			const result = await validator.validateSubtask(context)

			expect(result.isSuccessful).toBe(true)
			expect(result.changesSummary).toBe("Test changes")
			expect(result.researchSummary).toBe("Test research")
		})

		it("should track file changes from tool messages", async () => {
			const context: SubtaskValidationContext = {
				parentObjective: "Test objective",
				subtaskInstructions: "Test instructions",
				subtaskMessages: [
					{
						ts: Date.now(),
						type: "ask",
						ask: "tool",
						text: JSON.stringify({
							tool: "write_to_file",
							path: "test.js",
						}),
					} as ClineMessage,
				],
				filesBeforeSubtask: new Map(),
				orchestratorMode: "code",
			}

			const result = await validator.validateSubtask(context)

			expect(result.modifiedFiles).toContain("test.js")
		})

		it("should track command executions", async () => {
			const context: SubtaskValidationContext = {
				parentObjective: "Test objective",
				subtaskInstructions: "Test instructions",
				subtaskMessages: [
					{
						ts: Date.now(),
						type: "ask",
						ask: "command",
						text: "npm test",
					} as ClineMessage,
				],
				filesBeforeSubtask: new Map(),
				orchestratorMode: "code",
			}

			const result = await validator.validateSubtask(context)

			expect(result.executedCommands).toContain("npm test")
		})

		it("should handle validation errors gracefully", async () => {
			// Mock API to throw error
			mockTask.api = {
				createMessage: vi.fn().mockImplementation(() => {
					throw new Error("API error")
				}),
				getModel: vi.fn().mockReturnValue({
					id: "test-model",
					info: {},
				}),
			} as any

			const errorValidator = new SubtaskValidator(mockTask as Task)

			const context: SubtaskValidationContext = {
				parentObjective: "Test objective",
				subtaskInstructions: "Test instructions",
				subtaskMessages: [],
				filesBeforeSubtask: new Map(),
				orchestratorMode: "code",
			}

			const result = await errorValidator.validateSubtask(context)

			// Should return success with error message to avoid blocking
			expect(result.isSuccessful).toBe(true)
			expect(result.issues).toContain("Validation error: API error")
		})
	})

	describe("extractBasicSummary", () => {
		it("should extract summary from completion message", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "say",
					say: "completion_result",
					text: "Task completed successfully",
				} as ClineMessage,
			]

			// Access private method through any cast for testing
			const summary = (validator as any).extractBasicSummary(messages)

			expect(summary).toBe("Task completed successfully")
		})

		it("should count operations when no completion message", () => {
			const messages: ClineMessage[] = [
				{
					ts: Date.now(),
					type: "ask",
					ask: "tool",
					text: JSON.stringify({ tool: "write_to_file" }),
				} as ClineMessage,
				{
					ts: Date.now(),
					type: "ask",
					ask: "command",
					text: "npm test",
				} as ClineMessage,
			]

			const summary = (validator as any).extractBasicSummary(messages)

			expect(summary).toContain("1 file operations")
			expect(summary).toContain("1 commands")
		})
	})
})
