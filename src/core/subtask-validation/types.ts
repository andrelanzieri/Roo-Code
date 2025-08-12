import { ClineMessage } from "@roo-code/types"

/**
 * Result of subtask validation
 */
export interface SubtaskValidationResult {
	/**
	 * Whether the subtask completed successfully
	 */
	isSuccessful: boolean

	/**
	 * Summary of changes made by the subtask
	 */
	changesSummary: string

	/**
	 * Summary of research/findings from the subtask
	 */
	researchSummary?: string

	/**
	 * Issues found during validation
	 */
	issues?: string[]

	/**
	 * Suggestions for improvement if the subtask failed
	 */
	improvementSuggestions?: string[]

	/**
	 * Files that were modified by the subtask
	 */
	modifiedFiles?: string[]

	/**
	 * Commands that were executed
	 */
	executedCommands?: string[]

	/**
	 * Whether changes need to be reverted
	 */
	requiresRevert?: boolean

	/**
	 * Token usage for the validation process
	 */
	validationTokens?: {
		input: number
		output: number
		total: number
	}
}

/**
 * Configuration for subtask validation
 */
export interface SubtaskValidationConfig {
	/**
	 * Whether validation is enabled
	 */
	enabled: boolean

	/**
	 * Use a different model for validation (optional)
	 */
	validationApiConfigId?: string

	/**
	 * Maximum retries for failed subtasks
	 */
	maxRetries: number

	/**
	 * Whether to automatically revert changes on failure
	 */
	autoRevertOnFailure: boolean

	/**
	 * Include full file context in validation
	 */
	includeFullContext: boolean

	/**
	 * Custom validation prompt (optional)
	 */
	customValidationPrompt?: string
}

/**
 * Context for subtask validation
 */
export interface SubtaskValidationContext {
	/**
	 * The parent task's objective
	 */
	parentObjective: string

	/**
	 * The subtask's instructions
	 */
	subtaskInstructions: string

	/**
	 * Messages from the subtask execution
	 */
	subtaskMessages: ClineMessage[]

	/**
	 * Files that existed before the subtask
	 */
	filesBeforeSubtask: Map<string, string>

	/**
	 * Current mode of the orchestrator
	 */
	orchestratorMode: string

	/**
	 * Previous subtask results (if any)
	 */
	previousSubtaskResults?: SubtaskValidationResult[]
}

/**
 * File change tracking
 */
export interface FileChange {
	path: string
	type: "created" | "modified" | "deleted"
	contentBefore?: string
	contentAfter?: string
}

/**
 * Command execution tracking
 */
export interface CommandExecution {
	command: string
	output?: string
	exitCode?: number
	timestamp: number
}
