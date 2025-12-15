import type { OpenAI } from "openai"

import type { SerializedCustomToolDefinition } from "@roo-code/types"

export function formatNative(tool: SerializedCustomToolDefinition): OpenAI.Chat.ChatCompletionFunctionTool {
	const { parameters } = tool

	if (parameters) {
		delete parameters["$schema"]

		if (!parameters.required) {
			parameters.required = []
		}
	}

	return { type: "function", function: { ...tool, strict: true, parameters } }
}
