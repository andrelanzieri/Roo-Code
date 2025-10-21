export function getSharedToolUseSection(): string {
	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. You must use exactly one tool per message, and every assistant message must include a tool call. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool uses are formatted using XML-style tags. All tool calls must be wrapped in a <function_calls> element, with each tool invocation using an <invoke> tag that specifies the tool name in a "name" attribute. Parameters are specified using <parameter> tags with a "name" attribute. Here's the structure:

<function_calls>
<invoke name="actual_tool_name">
<parameter name="parameter1_name">value1</parameter>
<parameter name="parameter2_name">value2</parameter>
</invoke>
</function_calls>

Always use the actual tool name in the name attribute of the invoke tag for proper parsing and execution.`
}
