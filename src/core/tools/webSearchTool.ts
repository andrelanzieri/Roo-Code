import { Task } from "../task/Task"
import { formatResponse } from "../prompts/responses"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"

// Mock search results for demonstration
// In a real implementation, this would integrate with a search API
const mockSearchResults = [
	{
		title: "Getting started with Chrome Extension development",
		url: "https://developer.chrome.com/docs/extensions/get-started",
		snippet:
			"Learn how to create your first Chrome extension with manifest v3. This guide covers the basics of extension development including manifest files, background scripts, and content scripts.",
	},
	{
		title: "Chrome Extension Manifest V3 Documentation",
		url: "https://developer.chrome.com/docs/extensions/reference/manifest",
		snippet:
			"Complete reference for Chrome Extension Manifest V3. Includes all required and optional fields, permissions, and migration guide from V2.",
	},
	{
		title: "Web Extensions API Documentation",
		url: "https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions",
		snippet:
			"Cross-browser extension development guide. Learn how to build extensions that work across Chrome, Firefox, and Edge browsers.",
	},
]

export async function webSearchTool(
	cline: Task,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const query: string | undefined = block.params.query

	if (block.partial) {
		return
	}

	if (!query) {
		cline.consecutiveMistakeCount++
		cline.recordToolError("web_search")
		pushToolResult(await cline.sayAndCreateMissingParamError("web_search", "query"))
		return
	}

	try {
		cline.consecutiveMistakeCount = 0

		// Ask for approval before performing the search
		const approvalMessage = JSON.stringify({
			tool: "webSearch",
			query: removeClosingTag("query", query),
		})

		const didApprove = await askApproval("tool", approvalMessage)

		if (!didApprove) {
			return
		}

		// Log the search query
		await cline.say("text", `Searching the web for: "${query}"`)

		// In a real implementation, this would call an actual search API
		// For now, we'll return mock results to demonstrate the functionality
		// This allows the tool to work without requiring additional API keys or setup

		// Simulate API delay
		await new Promise((resolve) => setTimeout(resolve, 500))

		// Format the search results
		let resultText = `Web search results for "${query}":\n\n`

		mockSearchResults.forEach((result, index) => {
			resultText += `${index + 1}. **${result.title}**\n`
			resultText += `   URL: ${result.url}\n`
			resultText += `   ${result.snippet}\n\n`
		})

		resultText += `Note: This is a demonstration implementation. In production, this would integrate with a real search API like Google Custom Search, Bing Search API, or DuckDuckGo API.`

		// Record successful tool usage
		cline.recordToolUsage("web_search")

		// Return the search results
		pushToolResult(formatResponse.toolResult(resultText))
	} catch (error) {
		await handleError("performing web search", error)
		cline.recordToolError("web_search")
		return
	}
}
