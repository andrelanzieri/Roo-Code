import { deepSeekModels, deepSeekDefaultModelId } from "@roo-code/types"
import { Anthropic } from "@anthropic-ai/sdk"

import type { ApiHandlerOptions } from "../../shared/api"

import type { ApiStreamUsageChunk, ApiStream } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { OpenAiHandler } from "./openai"
import type { ApiHandlerCreateMessageMetadata } from "../index"

export class DeepSeekHandler extends OpenAiHandler {
	constructor(options: ApiHandlerOptions) {
		super({
			...options,
			openAiApiKey: options.deepSeekApiKey ?? "not-provided",
			openAiModelId: options.apiModelId ?? deepSeekDefaultModelId,
			openAiBaseUrl: options.deepSeekBaseUrl ?? "https://api.deepseek.com",
			openAiStreamingEnabled: true,
			includeMaxTokens: true,
		})
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Preprocess messages to handle potential Python code issues
		const processedMessages = this.preprocessMessages(messages)

		// Create a timeout controller
		let timeoutId: NodeJS.Timeout | null = null
		let hasTimedOut = false

		try {
			// Set up timeout for initial response
			const timeoutPromise = new Promise<never>((_, reject) => {
				timeoutId = setTimeout(() => {
					hasTimedOut = true
					reject(
						new Error(
							"DeepSeek API request timed out after 30 seconds. This may occur with certain Python files containing main() functions. Try breaking the file into smaller chunks or simplifying complex patterns.",
						),
					)
				}, 30000) // 30 second timeout for initial response
			})

			// Get the stream from parent handler
			const stream = super.createMessage(systemPrompt, processedMessages, metadata)
			let firstChunkReceived = false

			// Iterate through the stream
			for await (const chunk of stream) {
				// Clear timeout after first chunk is received
				if (!firstChunkReceived && timeoutId) {
					clearTimeout(timeoutId)
					timeoutId = null
					firstChunkReceived = true
				}

				// Check if we've timed out
				if (hasTimedOut) {
					throw new Error("DeepSeek API request timed out")
				}

				yield chunk
			}
		} catch (error) {
			// Clean up timeout if it exists
			if (timeoutId) {
				clearTimeout(timeoutId)
			}

			// Re-throw the error
			throw error
		} finally {
			// Ensure timeout is cleared
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	}

	private preprocessMessages(messages: Anthropic.Messages.MessageParam[]): Anthropic.Messages.MessageParam[] {
		return messages.map((message) => {
			if (message.content && typeof message.content === "string") {
				// Check if content appears to be Python code with main function
				if (this.isPythonMainPattern(message.content)) {
					// Escape potential problematic patterns
					return {
						...message,
						content: this.escapeProblematicPythonPatterns(message.content),
					}
				}
			} else if (Array.isArray(message.content)) {
				// Process array content
				const processedContent = message.content.map((part) => {
					if (part.type === "text" && this.isPythonMainPattern(part.text)) {
						return {
							...part,
							text: this.escapeProblematicPythonPatterns(part.text),
						}
					}
					return part
				})
				return {
					...message,
					content: processedContent,
				}
			}
			return message
		})
	}

	private isPythonMainPattern(content: string): boolean {
		// Check for Python main function patterns
		return /def\s+main\s*\(/.test(content) || /if\s+__name__\s*==\s*["']__main__["']/.test(content)
	}

	private escapeProblematicPythonPatterns(content: string): string {
		// Add zero-width spaces to break up potentially problematic patterns
		// This shouldn't affect the code's meaning but may prevent API hanging
		return content
			.replace(/if\s+__name__\s*==\s*["']__main__["']/g, 'if __name__ == "__main__"')
			.replace(/def\s+main\s*\(\s*\)/g, "def main()")
	}

	override getModel() {
		const id = this.options.apiModelId ?? deepSeekDefaultModelId
		const info = deepSeekModels[id as keyof typeof deepSeekModels] || deepSeekModels[deepSeekDefaultModelId]
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	// Override to handle DeepSeek's usage metrics, including caching.
	protected override processUsageMetrics(usage: any): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.prompt_tokens_details?.cache_miss_tokens,
			cacheReadTokens: usage?.prompt_tokens_details?.cached_tokens,
		}
	}
}
