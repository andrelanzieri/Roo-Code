import { type CustomToolDefinition, type SerializedCustomToolDefinition, parametersSchema } from "@roo-code/types"

export function serializeCustomTool({
	name,
	description,
	parameters,
}: CustomToolDefinition): SerializedCustomToolDefinition {
	return {
		name,
		description,
		parameters: parameters ? parametersSchema.toJSONSchema(parameters) : undefined,
	}
}

export function serializeCustomTools(tools: CustomToolDefinition[]): SerializedCustomToolDefinition[] {
	return tools.map(serializeCustomTool)
}
