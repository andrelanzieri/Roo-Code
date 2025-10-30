import type { ToolSpec } from "../../../api/transform/tool-converters"
import type { ToolName } from "@roo-code/types"
import type { SystemPromptSettings } from "../types"

// Import tool specifications (static for now, but wrapped in factories)
import { getReadFileToolSpec } from "./read-file"
import { writeToFileToolSpec } from "./write-to-file"
import { applyDiffToolSpec } from "./apply-diff"
import { executeCommandToolSpec } from "./execute-command"
import { listFilesToolSpec } from "./list-files"
import { searchFilesToolSpec } from "./search-files"
import { listCodeDefinitionNamesToolSpec } from "./list-code-definition-names"
import { codebaseSearchToolSpec } from "./codebase-search"
import { insertContentToolSpec } from "./insert-content"
import { searchAndReplaceToolSpec } from "./search-and-replace"
import { browserActionToolSpec } from "./browser-action"
import { useMcpToolToolSpec } from "./use-mcp-tool"
import { accessMcpResourceToolSpec } from "./access-mcp-resource"
import { askFollowupQuestionToolSpec } from "./ask-followup-question"
import { attemptCompletionToolSpec } from "./attempt-completion"
import { switchModeToolSpec } from "./switch-mode"
import { newTaskToolSpec } from "./new-task"
import { updateTodoListToolSpec } from "./update-todo-list"
import { runSlashCommandToolSpec } from "./run-slash-command"
import { generateImageToolSpec } from "./generate-image"
import { fetchInstructionsToolSpec } from "./fetch-instructions"

/**
 * Type for tool spec factories that can generate specs based on settings
 */
type ToolSpecFactory = (settings?: SystemPromptSettings) => ToolSpec

/**
 * Registry of all tool specification factories
 * All tool specs are now generated dynamically to support future configuration needs
 */
const TOOL_SPEC_FACTORIES: Record<ToolName, ToolSpecFactory> = {
	read_file: getReadFileToolSpec,
	write_to_file: () => writeToFileToolSpec,
	apply_diff: () => applyDiffToolSpec,
	execute_command: () => executeCommandToolSpec,
	list_files: () => listFilesToolSpec,
	search_files: () => searchFilesToolSpec,
	list_code_definition_names: () => listCodeDefinitionNamesToolSpec,
	codebase_search: () => codebaseSearchToolSpec,
	insert_content: () => insertContentToolSpec,
	search_and_replace: () => searchAndReplaceToolSpec,
	browser_action: () => browserActionToolSpec,
	use_mcp_tool: () => useMcpToolToolSpec,
	access_mcp_resource: () => accessMcpResourceToolSpec,
	ask_followup_question: () => askFollowupQuestionToolSpec,
	attempt_completion: () => attemptCompletionToolSpec,
	switch_mode: () => switchModeToolSpec,
	new_task: () => newTaskToolSpec,
	update_todo_list: () => updateTodoListToolSpec,
	run_slash_command: () => runSlashCommandToolSpec,
	generate_image: () => generateImageToolSpec,
	fetch_instructions: () => fetchInstructionsToolSpec,
}

/**
 * Static registry for backward compatibility
 * Maps tool names to their default specifications (generated without settings)
 */
export const TOOL_SPECS: Record<ToolName, ToolSpec> = {
	read_file: getReadFileToolSpec(),
	write_to_file: writeToFileToolSpec,
	apply_diff: applyDiffToolSpec,
	execute_command: executeCommandToolSpec,
	list_files: listFilesToolSpec,
	search_files: searchFilesToolSpec,
	list_code_definition_names: listCodeDefinitionNamesToolSpec,
	codebase_search: codebaseSearchToolSpec,
	insert_content: insertContentToolSpec,
	search_and_replace: searchAndReplaceToolSpec,
	browser_action: browserActionToolSpec,
	use_mcp_tool: useMcpToolToolSpec,
	access_mcp_resource: accessMcpResourceToolSpec,
	ask_followup_question: askFollowupQuestionToolSpec,
	attempt_completion: attemptCompletionToolSpec,
	switch_mode: switchModeToolSpec,
	new_task: newTaskToolSpec,
	update_todo_list: updateTodoListToolSpec,
	run_slash_command: runSlashCommandToolSpec,
	generate_image: generateImageToolSpec,
	fetch_instructions: fetchInstructionsToolSpec,
}

/**
 * Get tool specifications for a specific set of tool names
 * @param toolNames - Array of tool names to get specs for
 * @param settings - Optional settings to customize tool specs
 * @returns Array of tool specifications
 */
export function getToolSpecs(toolNames: ToolName[], settings?: SystemPromptSettings): ToolSpec[] {
	return toolNames
		.map((name) => {
			const factory = TOOL_SPEC_FACTORIES[name]
			return factory ? factory(settings) : undefined
		})
		.filter((spec): spec is ToolSpec => spec !== undefined)
}

/**
 * Get all available tool specifications with default settings
 * @returns Array of all tool specifications
 */
export function getAllToolSpecs(): ToolSpec[] {
	return Object.values(TOOL_SPECS)
}
