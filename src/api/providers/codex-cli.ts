import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import { exec } from "child_process"
import { promisify } from "util"
import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"

import { type ModelInfo, codexCliModels, codexCliDefaultModelId, codexCliModelInfoSaneDefaults } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { XmlMatcher } from "../../utils/xml-matcher"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream, ApiStreamUsageChunk } from "../transform/stream"
import { getModelParams } from "../transform/model-params"

import { DEFAULT_HEADERS } from "./constants"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { getApiRequestTimeout } from "./utils/timeout-config"
import { handleOpenAIError } from "./utils/openai-error-handler"

const execAsync = promisify(exec)

/**
 * Codex CLI Handler - Uses local CLI for authentication instead of API keys
 * Behaves exactly like OpenAI but with local login flow
 */
export class CodexCliHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ApiHandlerOptions
	private client: OpenAI | null = null
	private readonly providerName = "Codex CLI"
	private isInitialized = false

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options
	}

	/**
	 * Initialize the OpenAI client with session token from CLI
	 */
	private async initializeClient(): Promise<void> {
		if (this.isInitialized && this.client) {
			return
		}

		try {
			// Get the session token from secure storage or CLI
			const sessionToken = await this.getSessionToken()

			if (!sessionToken) {
				throw new Error("Not signed in. Please sign in to Codex CLI first.")
			}

			// Use the session token as the API key
			// The actual endpoint will be the same as OpenAI
			const baseURL = "https://api.openai.com/v1"

			const headers = {
				...DEFAULT_HEADERS,
			}

			const timeout = getApiRequestTimeout()

			this.client = new OpenAI({
				baseURL,
				apiKey: sessionToken,
				defaultHeaders: headers,
				timeout,
			})

			this.isInitialized = true
		} catch (error) {
			this.client = null
			this.isInitialized = false
			throw error
		}
	}

	/**
	 * Get session token from secure storage or CLI
	 */
	private async getSessionToken(): Promise<string | undefined> {
		// First check if we have a stored session token
		const storedToken = this.options.codexCliSessionToken
		if (storedToken) {
			return storedToken
		}

		// Try to get token from CLI
		const cliPath = this.options.codexCliPath || "codex"

		try {
			const { stdout } = await execAsync(`${cliPath} auth status --json`)
			const authStatus = JSON.parse(stdout)

			if (authStatus.authenticated && authStatus.token) {
				// Store the token for future use
				// Note: In the actual implementation, this should trigger a save to secure storage
				return authStatus.token
			}
		} catch (error) {
			// CLI not available or not authenticated
			console.error("Failed to get auth status from Codex CLI:", error)
		}

		return undefined
	}

	/**
	 * Sign in to Codex CLI
	 */
	public async signIn(): Promise<boolean> {
		const cliPath = this.options.codexCliPath || "codex"

		try {
			// Execute the sign-in command
			// This should open a browser for authentication
			const { stdout, stderr } = await execAsync(`${cliPath} auth login`)

			if (stderr) {
				console.error("Codex CLI sign-in error:", stderr)
				return false
			}

			// After successful login, get the token
			const token = await this.getSessionToken()
			if (token) {
				// Reset initialization to force client recreation
				this.isInitialized = false
				this.client = null
				await this.initializeClient()
				return true
			}
		} catch (error) {
			console.error("Failed to sign in to Codex CLI:", error)
		}

		return false
	}

	/**
	 * Sign out from Codex CLI
	 */
	public async signOut(): Promise<boolean> {
		const cliPath = this.options.codexCliPath || "codex"

		try {
			const { stderr } = await execAsync(`${cliPath} auth logout`)

			if (stderr) {
				console.error("Codex CLI sign-out error:", stderr)
				return false
			}

			// Clear the client
			this.client = null
			this.isInitialized = false

			return true
		} catch (error) {
			console.error("Failed to sign out from Codex CLI:", error)
		}

		return false
	}

	/**
	 * Check if CLI is available
	 */
	public async isCliAvailable(): Promise<boolean> {
		const cliPath = this.options.codexCliPath || "codex"

		try {
			await execAsync(`${cliPath} --version`)
			return true
		} catch {
			return false
		}
	}

	/**
	 * Check authentication status
	 */
	public async isAuthenticated(): Promise<boolean> {
		const token = await this.getSessionToken()
		return !!token
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// Ensure client is initialized
		await this.initializeClient()

		if (!this.client) {
			throw new Error("Codex CLI client not initialized. Please sign in first.")
		}

		const { info: modelInfo } = this.getModel()
		const modelId = this.options.apiModelId ?? codexCliDefaultModelId

		// Handle O1/O3/O4 family models specially
		if (modelId.includes("o1") || modelId.includes("o3") || modelId.includes("o4")) {
			yield* this.handleO3FamilyMessage(modelId, systemPrompt, messages, modelInfo)
			return
		}

		// Standard streaming for other models
		if (this.options.openAiStreamingEnabled ?? true) {
			let systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
				role: "system",
				content: systemPrompt,
			}

			let convertedMessages

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

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
				model: modelId,
				temperature: this.options.modelTemperature ?? 0,
				messages: convertedMessages,
				stream: true as const,
				stream_options: { include_usage: true },
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let stream
			try {
				stream = await this.client.chat.completions.create(requestOptions)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
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
		} else {
			// Non-streaming mode
			const systemMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
				role: "user",
				content: systemPrompt,
			}

			const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
				model: modelId,
				messages: [systemMessage, ...convertToOpenAiMessages(messages)],
			}

			// Add max_tokens if needed
			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let response
			try {
				response = await this.client.chat.completions.create(requestOptions)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			yield {
				type: "text",
				text: response.choices[0]?.message.content || "",
			}

			yield this.processUsageMetrics(response.usage, modelInfo)
		}
	}

	private async *handleO3FamilyMessage(
		modelId: string,
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		modelInfo: ModelInfo,
	): ApiStream {
		if (!this.client) {
			throw new Error("Codex CLI client not initialized")
		}

		if (this.options.openAiStreamingEnabled ?? true) {
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
				stream_options: { include_usage: true },
				reasoning_effort: modelInfo.reasoningEffort as "low" | "medium" | "high" | undefined,
				temperature: undefined,
			}

			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let stream
			try {
				stream = await this.client.chat.completions.create(requestOptions)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
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

			this.addMaxTokensIfNeeded(requestOptions, modelInfo)

			let response
			try {
				response = await this.client.chat.completions.create(requestOptions)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
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

	override getModel() {
		const id = this.options.apiModelId ?? codexCliDefaultModelId
		const info = codexCliModels[id as keyof typeof codexCliModels] ?? codexCliModelInfoSaneDefaults
		const params = getModelParams({ format: "openai", modelId: id, model: info, settings: this.options })
		return { id, info, ...params }
	}

	async completePrompt(prompt: string): Promise<string> {
		await this.initializeClient()

		if (!this.client) {
			throw new Error("Codex CLI client not initialized. Please sign in first.")
		}

		try {
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
				response = await this.client.chat.completions.create(requestOptions)
			} catch (error) {
				throw handleOpenAIError(error, this.providerName)
			}

			return response.choices[0]?.message.content || ""
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`${this.providerName} completion error: ${error.message}`)
			}

			throw error
		}
	}

	/**
	 * Adds max_completion_tokens to the request body if needed based on provider configuration
	 */
	protected addMaxTokensIfNeeded(
		requestOptions:
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming
			| OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
		modelInfo: ModelInfo,
	): void {
		// Only add max_completion_tokens if includeMaxTokens is true
		if (this.options.includeMaxTokens === true) {
			// Use user-configured modelMaxTokens if available, otherwise fall back to model's default maxTokens
			requestOptions.max_completion_tokens = this.options.modelMaxTokens || modelInfo.maxTokens
		}
	}
}

/**
 * Get available models for Codex CLI
 * Since it uses the same models as OpenAI, we return the predefined list
 */
export async function getCodexCliModels(): Promise<string[]> {
	return Object.keys(codexCliModels)
}
