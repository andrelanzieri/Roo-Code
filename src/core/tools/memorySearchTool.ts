import { Task } from "../task/Task"
import { MemoryService, MemorySearchResult } from "../../services/memory/MemoryService"
import { formatResponse } from "../prompts/responses"
import type {
	MemorySearchToolUse,
	AskApproval,
	HandleError,
	PushToolResult,
	RemoveClosingTag,
} from "../../shared/tools"

export async function memorySearchTool(
	cline: Task,
	toolUse: MemorySearchToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
): Promise<void> {
	const { query, project_context } = toolUse.params

	if (!query) {
		await cline.say("error", "Missing required parameter 'query' for memory_search tool")
		pushToolResult(formatResponse.toolError(formatResponse.missingToolParameterError("query")))
		return
	}

	const cleanedQuery = removeClosingTag("query", query)
	const cleanedProjectContext = project_context ? removeClosingTag("project_context", project_context) : undefined

	try {
		// Get the memory service instance using the provider's global storage path
		const provider = cline.providerRef.deref()
		if (!provider) {
			throw new Error("Provider reference lost")
		}
		const globalStoragePath = provider.context.globalStorageUri.fsPath
		const memoryService = MemoryService.getInstance(globalStoragePath)

		// Search for relevant memories
		const searchResults = await memoryService.searchMemories(
			cleanedQuery,
			cleanedProjectContext || cline.cwd,
			10, // Get top 10 results
		)

		if (searchResults.length === 0) {
			pushToolResult("No relevant memories found for the given query.")
			return
		}

		// Format the results
		const formattedResults = formatMemorySearchResults(searchResults)

		// Ask for approval to use the memories
		const approved = await askApproval(
			"tool",
			JSON.stringify({
				tool: "memory_search",
				query: cleanedQuery,
				resultsFound: searchResults.length,
				preview: searchResults[0]?.memory.summary || "No summary available",
			}),
		)

		if (!approved) {
			pushToolResult(formatResponse.toolDenied())
			return
		}

		pushToolResult(formattedResults)
	} catch (error) {
		await handleError("searching memories", error as Error)
		pushToolResult(formatResponse.toolError(`Error searching memories: ${error.message}`))
	}
}

function formatMemorySearchResults(results: MemorySearchResult[]): string {
	if (results.length === 0) {
		return "No relevant memories found."
	}

	const formatted = results
		.map((result, index) => {
			const { memory, score } = result
			const date = new Date(memory.timestamp).toLocaleString()
			const importance = memory.metadata?.importance || "normal"
			const mode = memory.metadata?.mode || "unknown"

			return `
### Memory ${index + 1} (Relevance: ${score})
**Date**: ${date}
**Mode**: ${mode}
**Importance**: ${importance}
**Summary**: ${memory.summary}

**Content**:
${memory.content}

${memory.conversationContext ? `**Context**: ${memory.conversationContext}` : ""}
---`
		})
		.join("\n")

	return `Found ${results.length} relevant memories:\n\n${formatted}`
}
