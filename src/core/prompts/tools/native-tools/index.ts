import type OpenAI from "openai"
import accessMcpResource from "./access_mcp_resource"
import askFollowupQuestion from "./ask_followup_question"
import attemptCompletion from "./attempt_completion"
import browserAction from "./browser_action"
import codebaseSearch from "./codebase_search"
import executeCommand from "./execute_command"
import fetchInstructions from "./fetch_instructions"
import generateImage from "./generate_image"
import insertContent from "./insert_content"
import listCodeDefinitionNames from "./list_code_definition_names"
import listFiles from "./list_files"
import newTask from "./new_task"
import { createReadFileTool } from "./read_file"
import runSlashCommand from "./run_slash_command"
import searchFiles from "./search_files"
import switchMode from "./switch_mode"
import updateTodoList from "./update_todo_list"
import writeToFile from "./write_to_file"
import { apply_diff_single_file } from "./apply_diff"

export { getMcpServerTools } from "./mcp_server"
export { convertOpenAIToolToAnthropic, convertOpenAIToolsToAnthropic } from "./converters"

/**
 * Get native tools array, optionally customizing based on settings.
 *
 * @param partialReadsEnabled - Whether to include line_ranges support in read_file tool (default: true)
 * @param codebaseSearchEnabled - Whether to include codebase_search tool (default: true)
 * @returns Array of native tool definitions
 */
export function getNativeTools(
	partialReadsEnabled: boolean = true,
	codebaseSearchEnabled: boolean = true,
): OpenAI.Chat.ChatCompletionTool[] {
	const tools: OpenAI.Chat.ChatCompletionTool[] = [
		accessMcpResource,
		apply_diff_single_file,
		askFollowupQuestion,
		attemptCompletion,
		browserAction,
		executeCommand,
		fetchInstructions,
		generateImage,
		insertContent,
		listCodeDefinitionNames,
		listFiles,
		newTask,
		createReadFileTool(partialReadsEnabled),
		runSlashCommand,
		searchFiles,
		switchMode,
		updateTodoList,
		writeToFile,
	]

	if (codebaseSearchEnabled) {
		tools.push(codebaseSearch)
	}

	return tools
}

// Backward compatibility: export default tools with line ranges enabled
export const nativeTools = getNativeTools(true)
