import type { OpenAI } from "openai"

import type { SerializedCustomToolDefinition } from "@roo-code/types"

export function formatNative(tool: SerializedCustomToolDefinition): OpenAI.Chat.ChatCompletionFunctionTool {
	return { type: "function", function: tool }
}
