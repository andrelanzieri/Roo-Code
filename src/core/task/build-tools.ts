import type OpenAI from "openai"
import type { ProviderSettings, ModeConfig, ModelInfo } from "@roo-code/types"
import type { ClineProvider } from "../webview/ClineProvider"
import { getNativeTools, getMcpServerTools } from "../prompts/tools/native-tools"
import {
	filterNativeToolsForMode,
	filterMcpToolsForMode,
	parseToolAliases,
	applyToolAliases,
	createReverseAliasMap,
} from "../prompts/tools/filter-tools-for-mode"

interface BuildToolsOptions {
	provider: ClineProvider
	cwd: string
	mode: string | undefined
	customModes: ModeConfig[] | undefined
	experiments: Record<string, boolean> | undefined
	apiConfiguration: ProviderSettings | undefined
	maxReadFileLine: number
	browserToolEnabled: boolean
	modelInfo?: ModelInfo
	diffEnabled: boolean
}

/**
 * Result of building native tools array.
 */
export interface BuildToolsResult {
	/** Array of filtered and optionally aliased native and MCP tools */
	tools: OpenAI.Chat.ChatCompletionTool[]
	/** Map from alias tool name back to original name (for reverse lookup when parsing tool calls) */
	toolAliasReverseMap: Map<string, string>
}

/**
 * Builds the complete tools array for native protocol requests.
 * Combines native tools and MCP tools, filtered by mode restrictions.
 * Applies any tool aliases specified in modelInfo.toolAliases.
 *
 * @param options - Configuration options for building the tools
 * @returns Object containing filtered tools and reverse alias map
 */
export async function buildNativeToolsArray(options: BuildToolsOptions): Promise<BuildToolsResult> {
	const {
		provider,
		cwd,
		mode,
		customModes,
		experiments,
		apiConfiguration,
		maxReadFileLine,
		browserToolEnabled,
		modelInfo,
		diffEnabled,
	} = options

	const mcpHub = provider.getMcpHub()

	// Get CodeIndexManager for feature checking
	const { CodeIndexManager } = await import("../../services/code-index/manager")
	const codeIndexManager = CodeIndexManager.getInstance(provider.context, cwd)

	// Build settings object for tool filtering
	const filterSettings = {
		todoListEnabled: apiConfiguration?.todoListEnabled ?? true,
		browserToolEnabled: browserToolEnabled ?? true,
		modelInfo,
		diffEnabled,
	}

	// Determine if partial reads are enabled based on maxReadFileLine setting
	const partialReadsEnabled = maxReadFileLine !== -1

	// Build native tools with dynamic read_file tool based on partialReadsEnabled
	const nativeTools = getNativeTools(partialReadsEnabled)

	// Filter native tools based on mode restrictions
	const filteredNativeTools = filterNativeToolsForMode(
		nativeTools,
		mode,
		customModes,
		experiments,
		codeIndexManager,
		filterSettings,
		mcpHub,
	)

	// Filter MCP tools based on mode restrictions
	const mcpTools = getMcpServerTools(mcpHub)
	const filteredMcpTools = filterMcpToolsForMode(mcpTools, mode, customModes, experiments)

	// Combine filtered tools
	let allTools = [...filteredNativeTools, ...filteredMcpTools]

	// Apply tool aliases if specified in modelInfo
	const aliasMap = parseToolAliases(modelInfo?.toolAliases)
	if (aliasMap.size > 0) {
		allTools = applyToolAliases(allTools, aliasMap)
	}

	// Create reverse map for parsing tool calls back to original names
	const toolAliasReverseMap = createReverseAliasMap(aliasMap)

	return {
		tools: allTools,
		toolAliasReverseMap,
	}
}
