import type { SerializedCustomToolDefinition, SerializedCustomToolParameters } from "@roo-code/types"

function getParameterDescription(name: string, parameter: SerializedCustomToolParameters, required: string[]): string {
	const requiredText = required.includes(name) ? "(required)" : "(optional)"
	return `- ${name}: ${requiredText} ${parameter.description} (type: ${parameter.type})`
}

function getUsage(tool: SerializedCustomToolDefinition): string {
	const lines: string[] = [`<${tool.name}>`]

	if (tool.parameters) {
		const required = tool.parameters.required ?? []

		for (const [argName, _argType] of Object.entries(tool.parameters.properties ?? {})) {
			const placeholder = required.includes(argName) ? `${argName} value here` : `optional ${argName} value`
			lines.push(`<${argName}>${placeholder}</${argName}>`)
		}
	}

	lines.push(`</${tool.name}>`)
	return lines.join("\n")
}

function getDescription(tool: SerializedCustomToolDefinition): string {
	const parts: string[] = []

	parts.push(`## ${tool.name}`)
	parts.push(`Description: ${tool.description}`)

	if (tool.parameters?.properties) {
		const required = tool.parameters?.required ?? []
		parts.push("Parameters:")

		for (const [name, parameter] of Object.entries(tool.parameters.properties)) {
			// What should we do with `boolean` values for `parameter`?
			if (typeof parameter !== "object") {
				continue
			}

			parts.push(getParameterDescription(name, parameter, required))
		}
	} else {
		parts.push("Parameters: None")
	}

	parts.push("Usage:")
	parts.push(getUsage(tool))

	return parts.join("\n")
}

export function formatXml(tools: SerializedCustomToolDefinition[]): string {
	if (tools.length === 0) {
		return ""
	}

	const descriptions = tools.map((tool) => getDescription(tool))

	return `# Custom Tools

The following custom tools are available for this mode. Use them in the same way as built-in tools.

${descriptions.join("\n\n")}`
}
