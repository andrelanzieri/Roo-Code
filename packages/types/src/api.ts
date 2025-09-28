/**
 * API for programmatic MCP server operations
 */

/**
 * Interface for MCP operations that can be accessed programmatically
 */
export interface McpApi {
	/**
	 * Refresh all MCP server connections
	 * @returns Promise that resolves when refresh is complete
	 */
	refreshMcpServers(): Promise<void>
}

/**
 * Global MCP API instance that will be set by the extension
 */
export let mcpApi: McpApi | undefined

/**
 * Set the global MCP API instance
 * @param api The MCP API implementation
 */
export function setMcpApi(api: McpApi): void {
	mcpApi = api
}

/**
 * Get the global MCP API instance
 * @returns The MCP API instance or undefined if not set
 */
export function getMcpApi(): McpApi | undefined {
	return mcpApi
}
