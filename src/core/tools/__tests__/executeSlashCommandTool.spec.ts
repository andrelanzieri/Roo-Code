import { describe, it, expect, vi, beforeEach } from "vitest"
import { executeSlashCommandTool, getAvailableSlashCommands, getSlashCommandsInfo } from "../executeSlashCommandTool"
import { Task } from "../../task/Task"
import { formatResponse } from "../../prompts/responses"

// Mock dependencies
vi.mock("../../prompts/responses", () => ({
	formatResponse: {
		toolResult: vi.fn((result) => result),
		toolError: vi.fn((error) => error),
	},
}))

describe("executeSlashCommandTool", () => {
	let mockCline: any
	let mockBlock: any
	let mockAskApproval: any
	let mockHandleError: any
	let mockPushToolResult: any
	let mockRemoveClosingTag: any

	beforeEach(() => {
		vi.clearAllMocks()

		// Create mock Cline instance
		mockCline = {
			taskId: "test-task-id",
			instanceId: "test-instance-id",
			consecutiveMistakeCount: 0,
			recordToolError: vi.fn(),
			sayAndCreateMissingParamError: vi.fn().mockResolvedValue("Missing parameter error"),
			say: vi.fn().mockResolvedValue(undefined),
			ask: vi.fn().mockResolvedValue({ response: "yesButtonClicked" }),
			checkpointSave: vi.fn().mockResolvedValue(undefined),
			providerRef: {
				deref: vi.fn().mockReturnValue({
					handleModeSwitch: vi.fn().mockResolvedValue(undefined),
				}),
			},
		} as any

		// Create mock tool use block
		mockBlock = {
			params: {
				slash_command: "checkpoint",
				args: undefined,
			},
			partial: false,
		}

		// Create mock functions
		mockAskApproval = vi.fn().mockResolvedValue(true)
		mockHandleError = vi.fn()
		mockPushToolResult = vi.fn()
		mockRemoveClosingTag = vi.fn((tag, value) => value)
	})

	describe("Basic functionality", () => {
		it("should execute checkpoint command successfully", async () => {
			mockBlock.params.slash_command = "checkpoint"

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.checkpointSave).toHaveBeenCalledWith(true)
			expect(mockPushToolResult).toHaveBeenCalledWith("Checkpoint created successfully")
			expect(mockCline.consecutiveMistakeCount).toBe(0)
		})

		it("should handle mode switch command", async () => {
			mockBlock.params.slash_command = "mode"
			mockBlock.params.args = "architect"

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			const provider = mockCline.providerRef.deref()
			expect(provider.handleModeSwitch).toHaveBeenCalledWith("architect")
			expect(mockPushToolResult).toHaveBeenCalledWith("Successfully switched to architect mode")
		})

		it("should handle test command", async () => {
			mockBlock.params.slash_command = "test"
			mockBlock.params.args = "npm run test:unit"

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith(
				expect.stringContaining("Would execute test command: npm run test:unit"),
			)
		})
	})

	describe("Error handling", () => {
		it("should handle missing slash_command parameter", async () => {
			mockBlock.params.slash_command = undefined

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.recordToolError).toHaveBeenCalledWith("execute_slash_command")
			expect(mockCline.sayAndCreateMissingParamError).toHaveBeenCalledWith(
				"execute_slash_command",
				"slash_command",
			)
			expect(mockPushToolResult).toHaveBeenCalledWith("Missing parameter error")
		})

		it("should handle unknown command", async () => {
			mockBlock.params.slash_command = "unknown_command"

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.recordToolError).toHaveBeenCalledWith("execute_slash_command")
			expect(mockCline.say).toHaveBeenCalledWith("error", expect.stringContaining("Unknown slash command"))
			expect(mockPushToolResult).toHaveBeenCalledWith(expect.stringContaining("Unknown slash command"))
		})

		it("should handle missing required arguments", async () => {
			mockBlock.params.slash_command = "mode"
			mockBlock.params.args = undefined

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.consecutiveMistakeCount).toBe(1)
			expect(mockCline.recordToolError).toHaveBeenCalledWith("execute_slash_command")
			expect(mockCline.say).toHaveBeenCalledWith("error", "The /mode command requires arguments")
			expect(mockPushToolResult).toHaveBeenCalledWith("The /mode command requires arguments")
		})

		it("should handle checkpoint save failure", async () => {
			mockBlock.params.slash_command = "checkpoint"
			mockCline.checkpointSave.mockRejectedValue(new Error("Checkpoint failed"))

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith("Failed to create checkpoint: Checkpoint failed")
		})

		it("should handle mode switch failure", async () => {
			mockBlock.params.slash_command = "mode"
			mockBlock.params.args = "invalid_mode"
			const provider = mockCline.providerRef.deref()
			provider.handleModeSwitch.mockRejectedValue(new Error("Invalid mode"))

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockPushToolResult).toHaveBeenCalledWith("Failed to switch to invalid_mode mode: Invalid mode")
		})
	})

	describe("User approval", () => {
		it("should ask for user approval before executing command", async () => {
			mockBlock.params.slash_command = "checkpoint"
			mockCline.ask.mockResolvedValue({ response: "yesButtonClicked" })

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.ask).toHaveBeenCalledWith(
				"tool",
				expect.stringContaining("Execute slash command: /checkpoint"),
			)
			expect(mockCline.checkpointSave).toHaveBeenCalled()
		})

		it("should not execute command if user denies approval", async () => {
			mockBlock.params.slash_command = "checkpoint"
			mockCline.ask.mockResolvedValue({ response: "noButtonClicked" })

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.checkpointSave).not.toHaveBeenCalled()
			expect(mockPushToolResult).toHaveBeenCalledWith("Slash command execution was rejected by the user.")
		})
	})

	describe("Partial blocks", () => {
		it("should handle partial blocks", async () => {
			mockBlock.partial = true
			mockBlock.params.slash_command = "checkpoint"

			await executeSlashCommandTool(
				mockCline as Task,
				mockBlock,
				mockAskApproval,
				mockHandleError,
				mockPushToolResult,
				mockRemoveClosingTag,
			)

			expect(mockCline.ask).toHaveBeenCalledWith(
				"tool",
				expect.stringContaining("execute_slash_command: /checkpoint"),
				true,
			)
			expect(mockCline.checkpointSave).not.toHaveBeenCalled()
			expect(mockPushToolResult).not.toHaveBeenCalled()
		})
	})
})

describe("getAvailableSlashCommands", () => {
	it("should return list of available commands", () => {
		const commands = getAvailableSlashCommands()
		expect(commands).toContain("review")
		expect(commands).toContain("mode")
		expect(commands).toContain("checkpoint")
		expect(commands).toContain("diff")
		expect(commands).toContain("test")
	})
})

describe("getSlashCommandsInfo", () => {
	it("should return detailed information about commands", () => {
		const info = getSlashCommandsInfo()

		expect(info).toHaveLength(5)

		const reviewCommand = info.find((cmd) => cmd.name === "review")
		expect(reviewCommand).toBeDefined()
		expect(reviewCommand?.requiresArgs).toBe(true)
		expect(reviewCommand?.description).toContain("Trigger code review")

		const checkpointCommand = info.find((cmd) => cmd.name === "checkpoint")
		expect(checkpointCommand).toBeDefined()
		expect(checkpointCommand?.requiresArgs).toBe(false)
		expect(checkpointCommand?.description).toContain("Create a checkpoint")
	})
})
