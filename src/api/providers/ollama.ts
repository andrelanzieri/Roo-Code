import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"

import { type ModelInfo, openAiModelInfoSaneDefaults, DEEP_SEEK_DEFAULT_TEMPERATURE } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { ApiStream } from "../transform/stream"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { getApiRequestTimeout } from "./utils/timeout-config"

interface OllamaMessage {
	role: "system" | "user" | "assistant"
	content: string
	images?: string[]
}

interface OllamaChatRequest {
	model: string
	messages: OllamaMessage[]
	stream?: boolean
	options?: {
		temperature?: number
		[key: string]: any
	}
}

interface OllamaChatResponse {
	model: string
	created_at: string
	message: {
		role: string
		content: string
	}
	done: boolean
	total_duration?: number
	load_duration?: number
	prompt_eval_count?: number
	prompt_eval_duration?: number
	eval_count?: number
	eval_duration?: number
}

interface OllamaStreamResponse {
	model: string
	created_at: string
	message?: {
		role: string
		content: string
	}
	done: boolean
	total_duration?: number
	load_duration?: number
	prompt_eval_count?: number
	prompt_eval_duration?: number
	eval_count?: number
	eval_duration?: number
}

export class OllamaHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private baseUrl: string

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
		this.baseUrl = this.options.ollamaBaseUrl || "http://localhost:11434"
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const modelId = this.getModel().id
		const useR1Format = modelId.toLowerCase().includes("deepseek-r1")

		// Convert Anthropic messages to Ollama format
		const ollamaMessages: OllamaMessage[] = [{ role: "system", content: systemPrompt }]

		// Convert messages to Ollama format
		for (const message of messages) {
			if (message.role === "user" || message.role === "assistant") {
				let content = ""
				let images: string[] = []

				if (typeof message.content === "string") {
					content = message.content
				} else if (Array.isArray(message.content)) {
					for (const block of message.content) {
						if (block.type === "text") {
							content += block.text
						} else if (block.type === "image" && "source" in block) {
							// Handle image blocks if present
							if (block.source.type === "base64") {
								images.push(block.source.data)
							}
						}
					}
				}

				const ollamaMessage: OllamaMessage = {
					role: message.role,
					content: content,
				}

				if (images.length > 0) {
					ollamaMessage.images = images
				}

				ollamaMessages.push(ollamaMessage)
			}
		}

		const requestBody: OllamaChatRequest = {
			model: modelId,
			messages: ollamaMessages,
			stream: true,
			options: {
				temperature: this.options.modelTemperature ?? (useR1Format ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
			},
		}

		try {
			const response = await axios.post(`${this.baseUrl}/api/chat`, requestBody, {
				responseType: "stream",
				timeout: getApiRequestTimeout(),
				headers: {
					"Content-Type": "application/json",
				},
			})

			const matcher = new XmlMatcher(
				"think",
				(chunk) =>
					({
						type: chunk.matched ? "reasoning" : "text",
						text: chunk.data,
					}) as const,
			)

			let buffer = ""
			let totalInputTokens = 0
			let totalOutputTokens = 0

			for await (const chunk of response.data) {
				const lines = chunk
					.toString()
					.split("\n")
					.filter((line: string) => line.trim())

				for (const line of lines) {
					try {
						const parsed: OllamaStreamResponse = JSON.parse(line)

						if (parsed.message?.content) {
							// Process content through matcher for reasoning detection
							for (const matcherChunk of matcher.update(parsed.message.content)) {
								yield matcherChunk
							}
						}

						// When streaming is done, extract token usage
						if (parsed.done) {
							if (parsed.prompt_eval_count) {
								totalInputTokens = parsed.prompt_eval_count
							}
							if (parsed.eval_count) {
								totalOutputTokens = parsed.eval_count
							}
						}
					} catch (e) {
						// Skip invalid JSON lines
						continue
					}
				}
			}

			// Yield any remaining content from the matcher
			for (const chunk of matcher.final()) {
				yield chunk
			}

			// Yield usage information if available
			if (totalInputTokens > 0 || totalOutputTokens > 0) {
				yield {
					type: "usage",
					inputTokens: totalInputTokens,
					outputTokens: totalOutputTokens,
				}
			}
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (error.code === "ECONNREFUSED") {
					throw new Error(`Ollama service is not running at ${this.baseUrl}. Please start Ollama first.`)
				} else if (error.response?.status === 404) {
					throw new Error(
						`Model ${modelId} not found in Ollama. Please pull the model first with: ollama pull ${modelId}`,
					)
				} else {
					throw new Error(`Ollama API error: ${error.message}`)
				}
			}
			throw error
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.ollamaModelId || "",
			info: openAiModelInfoSaneDefaults,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const modelId = this.getModel().id
			const useR1Format = modelId.toLowerCase().includes("deepseek-r1")

			const requestBody: OllamaChatRequest = {
				model: modelId,
				messages: [{ role: "user", content: prompt }],
				stream: false,
				options: {
					temperature: this.options.modelTemperature ?? (useR1Format ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
				},
			}

			const response = await axios.post<OllamaChatResponse>(`${this.baseUrl}/api/chat`, requestBody, {
				timeout: getApiRequestTimeout(),
				headers: {
					"Content-Type": "application/json",
				},
			})

			return response.data.message?.content || ""
		} catch (error) {
			if (axios.isAxiosError(error)) {
				if (error.code === "ECONNREFUSED") {
					throw new Error(`Ollama service is not running at ${this.baseUrl}. Please start Ollama first.`)
				} else if (error.response?.status === 404) {
					throw new Error(`Model ${this.getModel().id} not found in Ollama.`)
				} else {
					throw new Error(`Ollama completion error: ${error.message}`)
				}
			}
			if (error instanceof Error) {
				throw new Error(`Ollama completion error: ${error.message}`)
			}
			throw error
		}
	}
}
