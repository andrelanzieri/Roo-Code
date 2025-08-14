import { Anthropic } from "@anthropic-ai/sdk"
import type { ProviderSettingsWithId, ModelInfo } from "@roo-code/types"
import { ApiHandler, ApiHandlerCreateMessageMetadata, buildApiHandler } from "./index"
import { ApiStream, ApiStreamChunk, ApiStreamError } from "./transform/stream"
import { logger } from "../utils/logging"

/**
 * FallbackApiHandler wraps multiple API handlers and automatically falls back
 * to the next handler in the chain if the current one fails.
 */
export class FallbackApiHandler implements ApiHandler {
	private handlers: ApiHandler[]
	private configurations: ProviderSettingsWithId[]
	private currentHandlerIndex: number = 0
	private lastSuccessfulIndex: number = 0

	constructor(configurations: ProviderSettingsWithId[]) {
		if (!configurations || configurations.length === 0) {
			throw new Error("At least one API configuration is required")
		}

		this.configurations = configurations
		this.handlers = configurations.map((config) => buildApiHandler(config))
	}

	/**
	 * Creates a message with automatic fallback to secondary providers if the primary fails.
	 */
	createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Return an async generator that handles fallback logic
		return this.createMessageWithFallback(systemPrompt, messages, metadata)
	}

	private async *createMessageWithFallback(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		let lastError: Error | undefined

		// Try each handler in sequence until one succeeds
		for (let i = 0; i < this.handlers.length; i++) {
			this.currentHandlerIndex = i
			const handler = this.handlers[i]
			const config = this.configurations[i]

			try {
				logger.info(`Attempting API call with provider: ${config.apiProvider || "default"} (index ${i})`)

				// Create a stream from the current handler
				const stream = handler.createMessage(systemPrompt, messages, metadata)

				// Track if we've successfully received any chunks
				let hasReceivedChunks = false

				try {
					// Iterate through the stream and yield chunks
					for await (const chunk of stream) {
						hasReceivedChunks = true

						// Check if this is an error chunk
						if (chunk.type === "error") {
							// If we've already received some chunks, yield the error
							// Otherwise, throw to trigger fallback
							if (hasReceivedChunks) {
								yield chunk
							} else {
								throw new Error(chunk.message || chunk.error)
							}
						} else {
							// Yield successful chunks
							yield chunk
						}
					}

					// If we successfully completed the stream, update the last successful index
					if (hasReceivedChunks) {
						this.lastSuccessfulIndex = i
						logger.info(`API call succeeded with provider: ${config.apiProvider || "default"}`)
						return // Successfully completed, exit the function
					}
				} catch (streamError) {
					// Stream failed, try the next handler
					lastError = streamError as Error
					logger.warn(
						`API call failed with provider: ${config.apiProvider || "default"} (index ${i}). Error: ${lastError.message}`,
					)

					// If this is not the last handler, continue to the next one
					if (i < this.handlers.length - 1) {
						logger.info(`Falling back to next provider...`)
						continue
					}
				}
			} catch (error) {
				lastError = error as Error
				logger.warn(
					`API call failed with provider: ${config.apiProvider || "default"} (index ${i}). Error: ${lastError.message}`,
				)

				// If this is not the last handler, continue to the next one
				if (i < this.handlers.length - 1) {
					logger.info(`Falling back to next provider...`)
					continue
				}
			}
		}

		// All handlers failed, yield an error chunk
		const errorMessage = `All API providers failed. Last error: ${lastError?.message || "Unknown error"}`
		logger.error(errorMessage)

		const errorChunk: ApiStreamError = {
			type: "error",
			error: lastError?.message || "Unknown error",
			message: errorMessage,
		}

		yield errorChunk
	}

	/**
	 * Returns the model information from the currently active handler.
	 */
	getModel(): { id: string; info: ModelInfo } {
		// Return the model from the last successful handler, or the first one if none have succeeded yet
		const index = this.lastSuccessfulIndex
		return this.handlers[index].getModel()
	}

	/**
	 * Counts tokens using the currently active handler.
	 */
	async countTokens(content: Array<Anthropic.Messages.ContentBlockParam>): Promise<number> {
		// Use the last successful handler for token counting
		const index = this.lastSuccessfulIndex
		return this.handlers[index].countTokens(content)
	}

	/**
	 * Gets the current provider name for logging/debugging purposes.
	 */
	getCurrentProvider(): string {
		return this.configurations[this.currentHandlerIndex]?.apiProvider || "default"
	}

	/**
	 * Gets all configured providers in order.
	 */
	getConfiguredProviders(): string[] {
		return this.configurations.map((config) => config.apiProvider || "default")
	}

	/**
	 * Resets the handler to use the primary provider again.
	 */
	reset(): void {
		this.currentHandlerIndex = 0
		this.lastSuccessfulIndex = 0
	}
}
