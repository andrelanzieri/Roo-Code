import { ToolArgs } from "./types"

export function getAccessMcpResourceDescription(args: ToolArgs): string | undefined {
	if (!args.mcpHub) {
		return undefined
	}
	return `## access_mcp_resource
Description: Request to access a resource provided by a connected MCP server. Resources represent data sources that can be used as context, such as files, API responses, or system information.
Parameters:
- server_name: (required) The name of the MCP server providing the resource
- uri: (required) The URI identifying the specific resource to access
Usage:
<function_calls>
<invoke name="access_mcp_resource">
<parameter name="server_name">server name here</parameter>
<parameter name="uri">resource URI here</parameter>
</invoke>
</function_calls>

Example: Requesting to access an MCP resource

<function_calls>
<invoke name="access_mcp_resource">
<parameter name="server_name">weather-server</parameter>
<parameter name="uri">weather://san-francisco/current</parameter>
</invoke>
</function_calls>`
}
