import { promises as fs } from "node:fs"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"
import * as os from "os"
import * as path from "path"

import { type ModelInfo, type QwenCodeModelId, qwenCodeModels, qwenCodeDefaultModelId } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"

import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { handleOpenAIError } from "./utils/openai-error-handler"

import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler } from "../index"

const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai"
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`
const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56"
const QWEN_DIR = ".qwen"
const QWEN_CREDENTIAL_FILENAME = "oauth_creds.json"

interface QwenOAuthCredentials {
	access_token: string
	refresh_token: string
	token_type: string
	expiry_date: number
	resource_url?: string
}

interface QwenCodeHandlerOptions extends ApiHandlerOptions {
	qwenCodeOauthPath?: string
}

function getQwenCachedCredentialPath(customPath?: string): string {
	if (customPath) {
		// Support custom path that starts with ~/ or is absolute
		if (customPath.startsWith("~/")) {
			return path.join(os.homedir(), customPath.slice(2))
		}
		return path.resolve(customPath)
	}
	return path.join(os.homedir(), QWEN_DIR, QWEN_CREDENTIAL_FILENAME)
}

function objectToUrlEncoded(data: Record<string, string>): string {
	return Object.keys(data)
		.map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
		.join("&")
}

export class QwenCodeHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: QwenCodeHandlerOptions
	private credentials: QwenOAuthCredentials | null = null
	private client: OpenAI | undefined
	private refreshPromise: Promise<QwenOAuthCredentials> | null = null
	private readonly providerName = "QwenCode"

	constructor(options: QwenCodeHandlerOptions) {
		super()
		this.options = options
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			// Create the client instance with dummy key initially
			// The API key will be updated dynamically via ensureAuthenticated
			this.client = new OpenAI({
				apiKey: "dummy-key-will-be-replaced",
				baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
			})
		}
		return this.client
	}

	private async loadCachedQwenCredentials(): Promise<QwenOAuthCredentials> {
		try {
			const keyFile = getQwenCachedCredentialPath(this.options.qwenCodeOauthPath)
			const credsStr = await fs.readFile(keyFile, "utf-8")
			return JSON.parse(credsStr)
		} catch (error) {
			console.error(
				`Error reading or parsing credentials file at ${getQwenCachedCredentialPath(this.options.qwenCodeOauthPath)}`,
			)
			throw new Error(`Failed to load Qwen OAuth credentials: ${error}`)
		}
	}

	private async refreshAccessToken(credentials: QwenOAuthCredentials): Promise<QwenOAuthCredentials> {
		// If a refresh is already in progress, return the existing promise
		if (this.refreshPromise) {
			return this.refreshPromise
		}

		// Create a new refresh promise
		this.refreshPromise = this.doRefreshAccessToken(credentials)

		try {
			const result = await this.refreshPromise
			return result
		} finally {
			// Clear the promise after completion (success or failure)
			this.refreshPromise = null
		}
	}

	private async doRefreshAccessToken(credentials: QwenOAuthCredentials): Promise<QwenOAuthCredentials> {
		if (!credentials.refresh_token) {
			throw new Error("No refresh token available in credentials.")
		}

		const bodyData = {
			grant_type: "refresh_token",
			refresh_token: credentials.refresh_token,
			client_id: QWEN_OAUTH_CLIENT_ID,
		}

		const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: objectToUrlEncoded(bodyData),
		})

		if (!response.ok) {
			const errorText = await response.text()
			throw new Error(`Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`)
		}

		const tokenData = await response.json()

		if (tokenData.error) {
			throw new Error(`Token refresh failed: ${tokenData.error} - ${tokenData.error_description}`)
		}

		const newCredentials = {
			...credentials,
			access_token: tokenData.access_token,
			token_type: tokenData.token_type,
			refresh_token: tokenData.refresh_token || credentials.refresh_token,
			expiry_date: Date.now() + tokenData.expires_in * 1000,
		}

		const filePath = getQwenCachedCredentialPath(this.options.qwenCodeOauthPath)
		try {
			await fs.writeFile(filePath, JSON.stringify(newCredentials, null, 2))
		} catch (error) {
			console.error("Failed to save refreshed credentials:", error)
			// Continue with the refreshed token in memory even if file write fails
		}

		return newCredentials
	}

	private isTokenValid(credentials: QwenOAuthCredentials): boolean {
		const TOKEN_REFRESH_BUFFER_MS = 30 * 1000 // 30s buffer
		if (!credentials.expiry_date) {
			return false
		}
		return Date.now() < credentials.expiry_date - TOKEN_REFRESH_BUFFER_MS
	}

	private async ensureAuthenticated(): Promise<void> {
		if (!this.credentials) {
			this.credentials = await this.loadCachedQwenCredentials()
		}

		if (!this.isTokenValid(this.credentials)) {
			this.credentials = await this.refreshAccessToken(this.credentials)
		}

		// After authentication, update the apiKey and baseURL on the existing client
		const client = this.ensureClient()
		client.apiKey = this.credentials.access_token
		client.baseURL = this.getBaseUrl(this.credentials)
	}

	private getBaseUrl(creds: QwenOAuthCredentials): string {
		let baseUrl = creds.resource_url || "https://dashscope.aliyuncs.com/compatible-mode/v1"
		if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
			baseUrl = `https://${baseUrl}`
		}
		return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`
	}

	private async callApiWithRetry<T>(apiCall: () => Promise<T>): Promise<T> {
		try {
			return await apiCall()
		} catch (error: any) {
			if (error.status === 401) {
				// Token expired, refresh and retry
				this.credentials = await this.refreshAccessToken(this.credentials!)
				const client = this.ensureClient()
				client.apiKey = this.credentials.access_token
				client.baseURL = this.getBaseUrl(this.credentials)
				return await apiCall()
			} else {
				throw error
			}
		}
	}

	override async *createMessage(systemPrompt: string, messages: Anthropic.Messages.MessageParam[]): ApiStream {
		await this.ensureAuthenticated()
		const client = this.ensureClient()
		const model = this.getModel()

		const systemMessage: OpenAI.Chat.ChatCompletionSystemMessageParam = {
			role: "system",
			content: systemPrompt,
		}

		const convertedMessages = [systemMessage, ...convertToOpenAiMessages(messages)]

		// Extract tools from the system prompt if present
		const tools = this.extractToolsFromSystemPrompt(systemPrompt)

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
			model: model.id,
			temperature: this.options.modelTemperature ?? 0.2, // Use a slightly higher default for better tool usage
			messages: convertedMessages,
			stream: true,
			stream_options: { include_usage: true },
			// Use max_completion_tokens instead of deprecated max_tokens
			max_completion_tokens: this.options.modelMaxTokens || model.info.maxTokens,
			// Add tools if they were found in the system prompt
			...(tools.length > 0 && { tools }),
		}

		let stream
		try {
			stream = await this.callApiWithRetry(() => client.chat.completions.create(requestOptions))
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}

		let fullContent = ""

		for await (const apiChunk of stream) {
			const delta = apiChunk.choices[0]?.delta ?? {}

			if (delta.content) {
				let newText = delta.content
				if (newText.startsWith(fullContent)) {
					newText = newText.substring(fullContent.length)
				}
				fullContent = delta.content

				if (newText) {
					// Check for thinking blocks
					if (newText.includes("<think>") || newText.includes("</think>")) {
						// Simple parsing for thinking blocks
						const parts = newText.split(/<\/?think>/g)
						for (let i = 0; i < parts.length; i++) {
							if (parts[i]) {
								if (i % 2 === 0) {
									// Outside thinking block
									yield {
										type: "text",
										text: parts[i],
									}
								} else {
									// Inside thinking block
									yield {
										type: "reasoning",
										text: parts[i],
									}
								}
							}
						}
					} else {
						yield {
							type: "text",
							text: newText,
						}
					}
				}
			}

			if ("reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					text: (delta.reasoning_content as string | undefined) || "",
				}
			}

			if (apiChunk.usage) {
				yield {
					type: "usage",
					inputTokens: apiChunk.usage.prompt_tokens || 0,
					outputTokens: apiChunk.usage.completion_tokens || 0,
				}
			}
		}
	}

	override getModel(): { id: string; info: ModelInfo } {
		const id = this.options.apiModelId ?? qwenCodeDefaultModelId
		const info = qwenCodeModels[id as keyof typeof qwenCodeModels] || qwenCodeModels[qwenCodeDefaultModelId]
		return { id, info }
	}

	/**
	 * Extract tools from the system prompt if they are defined
	 * This helps the model understand what tools are available
	 */
	private extractToolsFromSystemPrompt(systemPrompt: string): OpenAI.Chat.Completions.ChatCompletionTool[] {
		const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = []

		// Look for tool definitions in the system prompt
		// This is a simple pattern matching approach - could be enhanced
		const toolPattern = /<tool_name>(.*?)<\/tool_name>.*?<parameters>(.*?)<\/parameters>/gs
		const matches = systemPrompt.matchAll(toolPattern)

		for (const match of matches) {
			const toolName = match[1].trim()
			const parametersText = match[2].trim()

			// Try to parse parameters into a schema
			try {
				// Create properties and required arrays with proper types
				const properties: Record<string, any> = {}
				const required: string[] = []

				// Create a basic function schema for the tool
				const tool: OpenAI.Chat.Completions.ChatCompletionTool = {
					type: "function",
					function: {
						name: toolName,
						description: `Tool: ${toolName}`,
						parameters: {
							type: "object",
							properties: properties,
							required: required,
						},
					},
				}

				// Parse parameter definitions if they follow a pattern
				const paramPattern = /- (\w+):\s*\((\w+)\)\s*(.*)/g
				const paramMatches = parametersText.matchAll(paramPattern)

				for (const paramMatch of paramMatches) {
					const paramName = paramMatch[1]
					const paramType = paramMatch[2].toLowerCase()
					const isRequired = paramMatch[3].includes("required")

					// Map to JSON schema types
					let schemaType = "string"
					if (paramType === "boolean") schemaType = "boolean"
					else if (paramType === "number" || paramType === "integer") schemaType = "number"
					else if (paramType === "array") schemaType = "array"
					else if (paramType === "object") schemaType = "object"

					properties[paramName] = {
						type: schemaType,
						description: paramMatch[3],
					}

					if (isRequired) {
						required.push(paramName)
					}
				}

				tools.push(tool)
			} catch (error) {
				// If we can't parse the tool definition, skip it
				console.debug(`Could not parse tool definition for ${toolName}:`, error)
			}
		}

		return tools
	}

	async completePrompt(prompt: string): Promise<string> {
		await this.ensureAuthenticated()
		const client = this.ensureClient()
		const model = this.getModel()

		const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
			model: model.id,
			messages: [{ role: "user", content: prompt }],
			// Use max_completion_tokens instead of deprecated max_tokens
			max_completion_tokens: this.options.modelMaxTokens || model.info.maxTokens,
			temperature: this.options.modelTemperature ?? 0.2,
		}

		let response
		try {
			response = await this.callApiWithRetry(() => client.chat.completions.create(requestOptions))
		} catch (error) {
			throw handleOpenAIError(error, this.providerName)
		}

		return response.choices[0]?.message.content || ""
	}
}
