import { ToolArgs } from "./types"

export function getUseMcpToolDescription(args: ToolArgs): string | undefined {
	if (!args.mcpHub) {
		return undefined
	}
	return `## use_mcp_tool
Description: Request to use a tool provided by a connected MCP server. Each MCP server can provide multiple tools with different capabilities. Tools have defined input schemas that specify required and optional parameters.
Parameters:
- server_name: (required) The name of the MCP server providing the tool
- tool_name: (required) The name of the tool to execute
- arguments: (required) A JSON object containing the tool's input parameters, following the tool's input schema
Usage:
<function_calls>
<invoke name="use_mcp_tool">
<parameter name="server_name">server name here</parameter>
<parameter name="tool_name">tool name here</parameter>
<parameter name="arguments">
{
  "param1": "value1",
  "param2": "value2"
}
</parameter>
</invoke>
</function_calls>

Example: Requesting to use an MCP tool

<function_calls>
<invoke name="use_mcp_tool">
<parameter name="server_name">weather-server</parameter>
<parameter name="tool_name">get_forecast</parameter>
<parameter name="arguments">
{
  "city": "San Francisco",
  "days": 5
}
</parameter>
</invoke>
</function_calls>`
}
