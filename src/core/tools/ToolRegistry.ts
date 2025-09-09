import { ToolName, ToolGroup } from "@roo-code/types"
import { RooTool } from "./base/RooTool"
import { WriteToFileTool } from "./implementations/WriteToFileTool"
// Import other tool implementations as they are created
// import { ReadFileTool } from "./implementations/ReadFileTool"
// import { ExecuteCommandTool } from "./implementations/ExecuteCommandTool"
// etc...

/**
 * ToolRegistry - Singleton registry for managing all tool instances
 * This centralizes tool management and eliminates the need for scattered
 * tool maps and switch statements throughout the codebase.
 */
export class ToolRegistry {
	private static instance: ToolRegistry
	private tools: Map<ToolName, RooTool>

	private constructor() {
		this.tools = new Map()
		this.registerTools()
	}

	/**
	 * Get the singleton instance of the ToolRegistry
	 */
	static getInstance(): ToolRegistry {
		if (!ToolRegistry.instance) {
			ToolRegistry.instance = new ToolRegistry()
		}
		return ToolRegistry.instance
	}

	/**
	 * Register all available tools
	 * This is where new tool implementations are added to the registry
	 */
	private registerTools(): void {
		// Register each tool implementation
		this.registerTool(new WriteToFileTool())

		// Add other tools as they are implemented
		// this.registerTool(new ReadFileTool())
		// this.registerTool(new ExecuteCommandTool())
		// this.registerTool(new ApplyDiffTool())
		// this.registerTool(new SearchFilesTool())
		// this.registerTool(new ListFilesTool())
		// this.registerTool(new ListCodeDefinitionNamesTool())
		// this.registerTool(new BrowserActionTool())
		// this.registerTool(new UseMcpToolTool())
		// this.registerTool(new AccessMcpResourceTool())
		// this.registerTool(new AskFollowupQuestionTool())
		// this.registerTool(new AttemptCompletionTool())
		// this.registerTool(new SwitchModeTool())
		// this.registerTool(new NewTaskTool())
		// this.registerTool(new InsertContentTool())
		// this.registerTool(new SearchAndReplaceTool())
		// this.registerTool(new CodebaseSearchTool())
		// this.registerTool(new UpdateTodoListTool())
		// this.registerTool(new RunSlashCommandTool())
		// this.registerTool(new GenerateImageTool())
		// this.registerTool(new FetchInstructionsTool())
	}

	/**
	 * Register a tool in the registry
	 */
	private registerTool(tool: RooTool): void {
		this.tools.set(tool.name, tool)
	}

	/**
	 * Get a tool by name
	 */
	getTool(name: ToolName): RooTool | undefined {
		return this.tools.get(name)
	}

	/**
	 * Get all tools
	 */
	getAllTools(): RooTool[] {
		return Array.from(this.tools.values())
	}

	/**
	 * Get tools by group
	 */
	getToolsByGroup(group: ToolGroup): RooTool[] {
		return this.getAllTools().filter((tool) => tool.belongsToGroup(group))
	}

	/**
	 * Get all tool names
	 */
	getToolNames(): ToolName[] {
		return Array.from(this.tools.keys())
	}

	/**
	 * Check if a tool exists
	 */
	hasTool(name: ToolName): boolean {
		return this.tools.has(name)
	}

	/**
	 * Get tool description map for prompts
	 * This replaces the old toolDescriptionMap
	 */
	getToolDescriptionMap(): Record<string, (args: any) => string | undefined> {
		const descriptionMap: Record<string, (args: any) => string | undefined> = {}

		for (const [name, tool] of this.tools) {
			descriptionMap[name] = (args) => tool.getDescription(args)
		}

		return descriptionMap
	}

	/**
	 * Get tool display names
	 * This replaces the old TOOL_DISPLAY_NAMES constant
	 */
	getToolDisplayNames(): Record<ToolName, string> {
		const displayNames: Record<string, string> = {}

		// Map tool names to display names
		const nameMapping: Record<ToolName, string> = {
			execute_command: "run commands",
			read_file: "read files",
			fetch_instructions: "fetch instructions",
			write_to_file: "write files",
			apply_diff: "apply changes",
			search_files: "search files",
			list_files: "list files",
			list_code_definition_names: "list definitions",
			browser_action: "use a browser",
			use_mcp_tool: "use mcp tools",
			access_mcp_resource: "access mcp resources",
			ask_followup_question: "ask questions",
			attempt_completion: "complete tasks",
			switch_mode: "switch modes",
			new_task: "create new task",
			insert_content: "insert content",
			search_and_replace: "search and replace",
			codebase_search: "codebase search",
			update_todo_list: "update todo list",
			run_slash_command: "run slash command",
			generate_image: "generate images",
		}

		for (const name of this.getToolNames()) {
			displayNames[name] = nameMapping[name] || name
		}

		return displayNames as Record<ToolName, string>
	}
}

// Export a singleton instance for convenience
export const toolRegistry = ToolRegistry.getInstance()
