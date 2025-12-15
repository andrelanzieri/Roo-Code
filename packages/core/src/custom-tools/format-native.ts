import type { OpenAI } from "openai"

import type { SerializedCustomToolDefinition } from "@roo-code/types"

export function formatNative(tool: SerializedCustomToolDefinition): OpenAI.Chat.ChatCompletionFunctionTool {
	const { parameters } = tool

	if (parameters) {
		// We don't need the $schema property; none of the other tools specify it.
		delete parameters["$schema"]

		// https://community.openai.com/t/on-the-function-calling-what-about-if-i-have-no-parameter-to-call/516876
		if (!parameters.required) {
			parameters.required = []
		}
	}

	return { type: "function", function: { ...tool, strict: true, parameters } }
}
