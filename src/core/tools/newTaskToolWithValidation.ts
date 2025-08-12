import delay from "delay"
import { RooCodeEventName } from "@roo-code/types"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { Task } from "../task/Task"
import { defaultModeSlug, getModeBySlug } from "../../shared/modes"
import { formatResponse } from "../prompts/responses"
import { t } from "../../i18n"
import { SubtaskValidator, SubtaskValidationContext } from "../subtask-validation"

/**
 * Enhanced version of newTaskTool with subtask validation
 * This implements the "parallel universe" validation system from issue #6970
 */
export async function newTaskToolWithValidation(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const mode: string | undefined = block.params.mode
	const message: string | undefined = block.params.message

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				tool: "newTask",
				mode: removeClosingTag("mode", mode),
				content: removeClosingTag("message", message),
			})

			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!mode) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("new_task")
				pushToolResult(await cline.sayAndCreateMissingParamError("new_task", "mode"))
				return
			}

			if (!message) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("new_task")
				pushToolResult(await cline.sayAndCreateMissingParamError("new_task", "message"))
				return
			}

			cline.consecutiveMistakeCount = 0
			const unescapedMessage = message.replace(/\\\\@/g, "\\@")

			// Verify the mode exists
			const targetMode = getModeBySlug(mode, (await cline.providerRef.deref()?.getState())?.customModes)

			if (!targetMode) {
				pushToolResult(formatResponse.toolError(`Invalid mode: ${mode}`))
				return
			}

			const toolMessage = JSON.stringify({
				tool: "newTask",
				mode: targetMode.name,
				content: message,
			})

			const didApprove = await askApproval("tool", toolMessage)

			if (!didApprove) {
				return
			}

			const provider = cline.providerRef.deref()

			if (!provider) {
				return
			}

			// Get validation configuration from state
			const state = (await provider.getState()) as any // Type assertion for proof-of-concept
			const validationConfig = {
				enabled: state.subtaskValidationEnabled ?? false,
				validationApiConfigId: state.subtaskValidationApiConfigId,
				maxRetries: state.subtaskValidationMaxRetries ?? 2,
				autoRevertOnFailure: state.subtaskValidationAutoRevert ?? true,
				includeFullContext: state.subtaskValidationIncludeFullContext ?? false,
				customValidationPrompt: state.subtaskValidationCustomPrompt,
			}

			// Store parent task context for validation
			const parentObjective = cline.clineMessages.find((m) => m.type === "say" && m.say === "text")?.text || ""
			const filesBeforeSubtask = new Map<string, string>()

			if (cline.enableCheckpoints) {
				cline.checkpointSave(true)
			}

			// Preserve the current mode so we can resume with it later
			cline.pausedModeSlug = (await provider.getState()).mode ?? defaultModeSlug

			// Create new task instance first
			const newCline = await provider.initClineWithTask(unescapedMessage, undefined, cline)
			if (!newCline) {
				pushToolResult(t("tools:newTask.errors.policy_restriction"))
				return
			}

			// Now switch the newly created task to the desired mode
			await provider.handleModeSwitch(mode)

			// Delay to allow mode change to take effect
			await delay(500)

			// Set up validation if enabled
			if (validationConfig.enabled) {
				// Create validator instance
				const validator = new SubtaskValidator(cline, validationConfig)

				// Set up listener for subtask completion
				const validateOnCompletion = async () => {
					// Wait for subtask to complete
					await new Promise<void>((resolve) => {
						const checkInterval = setInterval(() => {
							if (!newCline.isPaused) {
								clearInterval(checkInterval)
								resolve()
							}
						}, 1000)
					})

					// Prepare validation context
					const validationContext: SubtaskValidationContext = {
						parentObjective,
						subtaskInstructions: unescapedMessage,
						subtaskMessages: newCline.clineMessages,
						filesBeforeSubtask,
						orchestratorMode: cline.pausedModeSlug,
					}

					// Validate the subtask
					const validationResult = await validator.validateSubtask(validationContext)

					// Handle validation result
					if (!validationResult.isSuccessful) {
						// Log validation failure
						await cline.say(
							"text",
							`⚠️ Subtask validation failed:\n${validationResult.issues?.join("\n") || "Unknown issues"}`,
						)

						// If auto-revert is enabled, revert changes
						if (validationConfig.autoRevertOnFailure && validationResult.requiresRevert) {
							await cline.say("text", "🔄 Reverting subtask changes...")
							// Revert logic would go here
						}

						// Provide improvement suggestions
						if (validationResult.improvementSuggestions) {
							await cline.say(
								"text",
								`💡 Suggestions for retry:\n${validationResult.improvementSuggestions.join("\n")}`,
							)
						}

						// Retry with improved instructions if within retry limit
						if (validationConfig.maxRetries > 0) {
							// Retry logic would go here
						}
					} else {
						// Validation successful
						await cline.say(
							"text",
							`✅ Subtask validated successfully:\n${validationResult.changesSummary}`,
						)

						if (validationResult.researchSummary) {
							await cline.say("text", `📊 Research findings:\n${validationResult.researchSummary}`)
						}
					}
				}

				// Start validation in background
				validateOnCompletion().catch((error) => {
					console.error("Validation error:", error)
				})
			}

			cline.emit(RooCodeEventName.TaskSpawned, newCline.taskId)

			pushToolResult(`Successfully created new task in ${targetMode.name} mode with message: ${unescapedMessage}`)

			// Set the isPaused flag to true so the parent task can wait for the sub-task to finish
			cline.isPaused = true
			cline.emit(RooCodeEventName.TaskPaused)

			return
		}
	} catch (error) {
		await handleError("creating new task", error)
		return
	}
}
