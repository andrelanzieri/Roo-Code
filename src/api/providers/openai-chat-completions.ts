import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

import { type ModelInfo, DEEP_SEEK_DEFAULT_TEMPERATURE, OPENAI_AZURE_AI_INFERENCE_PATH } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { convertToR1Format } from "../transform/r1-format"
import { convertToSimpleMessages } from "../transform/simple-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"

import { OpenAIBaseHandler } from "./openai-base"
import type { ApiHandlerCreateMessageMetadata } from "../index"

/**
 * Handler for OpenAI Chat Completions API
 * Handles standard chat completions, o1/o3/o4 models, DeepSeek reasoner, and other variations
 */
export class OpenAIChatCompletionsHandler extends OpenAIBaseHandler {
	constructor(options: ApiHandlerOptions) {
		// Use "OpenAI" for backward compatibility with existing tests
		super(options, "OpenAI")
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { info: modelInfo, reasoning } = this.getModel()
		const modelUrl = this.options.openAiBaseUrl ?? ""
		const modelId = this.options.openAiModelId ?? ""
		const enabledR1Format = this.options.openAiR1FormatEnabled ?? false
		const enabledLegacyFormat = this.options.openAiLegacyFormat ?? false
		const isAzureAiInference = this._isAzureAiInference(modelUrl)
		const deepseekReasoner = modelId.includes("deepseek-reasoner") || enabledR1Format
		const ark = modelUrl.includes(".volces.com")

		// Handle O1/O3/O4 family models separately
		if (modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages)
			return
		}

		if (this.options.openAiStreamingEnabled ?? true) {
			yield* this.handleStreamingMessage(
				systemPrompt,
				messages,
				modelInfo,
				modelId,
				deepseekReasoner,
				ark,
				enabledLegacyFormat,
				isAzureAiInference,
				reasoning,
			)
		} else {
			yield* this.handleNonStreamingMessage(
				systemPrompt,
				messages,
				modelInfo,
				modelId,
				deepseekReasoner,
				enabledLegacyFormat,
				isAzureAiInference,
			)
		}
	}

	private async *handleStreamingMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		modelInfo: ModelInfo,
		modelId: string,
		deepseekReasoner: boolean,
		ark: boolean,
		enabledLegacyFormat: boolean,
		isAzureAiInference: boolean,
		reasoning: any,
	): ApiStream {
		let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
			role: "system",
			content: systemPrompt,
		}

		let convertedMessages

		if (deepseekReasoner) {
			convertedMessages = convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
		} else if (ark || enabledLegacyFormat) {
			convertedMessages = [systemMessage, ...convertToSimpleMessages(messages)]
		} else {
			if (modelInfo.supportsPromptCache) {
				systemMessage = {
					role: "system",
					content: [
						{
							type: "text",
							text: systemPrompt,
							// @ts-ignore-next-line
							cache_control: { type: "ephemeral" },
						},
					],
				}
			}

			convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]

			if (modelInfo.supportsPromptCache) {
				// Add cache_control to the last two user messages
				const lastTwoUserMessages = convertedMessages.filter((msg) => msg.role === "user").slice(-2)

				lastTwoUserMessages.forEach((msg) => {
					if (typeof msg.content === "string") {
						msg.content = [{ type: "text", text: msg.content }]
					}

					if (Array.isArray(msg.content)) {
						let lastTextPart = msg.content.filter((part) => part.type === "text").pop()

						if (!lastTextPart) {
							lastTextPart = { type: "text", text: "..." }
							msg.content.push(lastTextPart)
						}

						// @ts-ignore-next-line
						lastTextPart["cache_control"] = { type: "ephemeral" }
					}
				})
			}
		}

		const isGrokXAI = this._isGrokXAI(this.options.openAiBaseUrl)

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: modelId,
			temperature: this.options.modelTemperature ?? (deepseekReasoner ? DEEP_SEEK_DEFAULT_TEMPERATURE : 0),
			messages: convertedMessages,
			stream: true as const,
			...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
			...(reasoning && reasoning),
		}

		// Add max_tokens if needed
		this.addMaxTokensIfNeeded(requestOptions, modelInfo)

		let stream
		try {
			stream = await this.client.chat.completions.create(
				requestOptions,
				isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)
		} catch (error) {
			this.handleError(error)
		}

		const matcher = new XmlMatcher(
			"think",
			(chunk) =>
				({
					type: chunk.matched ? "reasoning" : "text",
					text: chunk.data,
				}) as const,
		)

		let lastUsage

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta ?? {}

			if (delta.content) {
				for (const chunk of matcher.update(delta.content)) {
					yield chunk
				}
			}

			if ("reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					text: (delta.reasoning_content as string | undefined) || "",
				}
			}
			if (chunk.usage) {
				lastUsage = chunk.usage
			}
		}

		for (const chunk of matcher.final()) {
			yield chunk
		}

		if (lastUsage) {
			yield this.processUsageMetrics(lastUsage, modelInfo)
		}
	}

	private async *handleNonStreamingMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		modelInfo: ModelInfo,
		modelId: string,
		deepseekReasoner: boolean,
		enabledLegacyFormat: boolean,
		isAzureAiInference: boolean,
	): ApiStream {
		const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
			role: "user",
			content: systemPrompt,
		}

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: modelId,
			messages: deepseekReasoner
				? convertToR1Format([{ role: "user", content: systemPrompt }, ...messages])
				: enabledLegacyFormat
					? [systemMessage, ...convertToSimpleMessages(messages)]
					: [systemMessage, ...convertToOpenAiMessages(messages)],
		}

		// Add max_tokens if needed
		this.addMaxTokensIfNeeded(requestOptions, modelInfo)

		let response
		try {
			response = await this.client.chat.completions.create(
				requestOptions,
				isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
			)
		} catch (error) {
			this.handleError(error)
		}

		yield {
			type: "text",
			text: response.choices[0]?.message.content || "",
		}

		yield this.processUsageMetrics(response.usage, modelInfo)
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
	): ApiStream {
		const modelInfo = this.getModel().info
		const methodIsAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)

		if (this.options.openAiStreamingEnabled ?? true) {
			const isGrokXAI = this._isGrokXAI(this.options.openAiBaseUrl)

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				stream: true,
				...(isGrokXAI ? {} : { stream_options: { include_usage: true } }),
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
			}

			// O3 family models support max_completion_tokens
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let stream
			try {
				stream = await this.client.chat.completions.create(
					requestOptions,
					methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				this.handleError(error)
			}

			yield* this.handleStreamResponse(stream)
		} else {
			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [
					{
						role: "developer",
						content: `Formatting re-enabled\n${systemPrompt}`,
					},
					...convertToOpenAiMessages(messages),
				],
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
			}

			// O3 family models support max_completion_tokens
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let response
			try {
				response = await this.client.chat.completions.create(
					requestOptions,
					methodIsAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				this.handleError(error)
			}

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}
			yield this.processUsageMetrics(response.usage)
		}
	}

	private async *handleStreamResponse(stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>): ApiStream {
		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (chunk.usage) {
				yield {
					type: "usage",
					inputTokens: chunk.usage.prompt_tokens || 0,
					outputTokens: chunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	protected processUsageMetrics(usage: any, _modelInfo?: ModelInfo): ApiStreamUsageChunk {
		return {
			type: "usage",
			inputTokens: usage?.prompt_tokens || 0,
			outputTokens: usage?.completion_tokens || 0,
			cacheWriteTokens: usage?.cache_creation_input_tokens || undefined,
			cacheReadTokens: usage?.cache_read_input_tokens || undefined,
		}
	}

	async completePrompt(prompt: string): Promise<string> {
		try {
			const isAzureAiInference = this._isAzureAiInference(this.options.openAiBaseUrl)
			const model = this.getModel()
			const modelInfo = model.info

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: model.id,
				messages: [{ role: "user", content: prompt }],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let response
			try {
				response = await this.client.chat.completions.create(
					requestOptions,
					isAzureAiInference ? { path: OPENAI_AZURE_AI_INFERENCE_PATH } : {},
				)
			} catch (error) {
				this.handleError(error)
			}

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`${this.providerName} completion error: ${error.message}`)
			}

			throw error
		}
	}
}
