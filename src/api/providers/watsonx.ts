import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import { ModelInfo, watsonxAiDefaultModelId, watsonxAiModels, WatsonxAIModelId, baseModelInfo } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared/api"
import { IamAuthenticator, CloudPakForDataAuthenticator } from "ibm-cloud-sdk-core"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { WatsonXAI } from "@ibm-cloud/watsonx-ai"
import { convertToWatsonxAiMessages } from "../transform/watsonxai-format"

/**
 * Extended API handler options for Watson X AI
 */
interface WatsonxApiHandlerOptions extends ApiHandlerOptions {
	watsonxProjectId?: string
	watsonxBaseUrl?: string
	watsonxPlatform?: "ibmCloud" | "cloudPak"
	watsonxUsername?: string
	watsonxPassword?: string
	watsonxAuthType?: "apiKey" | "password"
	watsonxApiKey?: string
	watsonxModelId?: string
}

/**
 * Watson X service configuration options
 */
interface WatsonxServiceOptions {
	version: string
	serviceUrl: string
	authenticator: IamAuthenticator | CloudPakForDataAuthenticator
}

/**
 * Watson X message format
 */
interface WatsonxMessage {
	role: string
	content: string
}

/**
 * Watson X text chat parameters
 */
interface WatsonxTextChatParams {
	projectId: string
	modelId: string
	messages: WatsonxMessage[]
	maxTokens: number
	temperature: number
}

export class WatsonxAIHandler extends BaseProvider implements SingleCompletionHandler {
	private options: WatsonxApiHandlerOptions
	private projectId: string
	private service: WatsonXAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options as WatsonxApiHandlerOptions

		if (!this.options.watsonxProjectId) {
			throw new Error("You must provide a valid IBM watsonx project ID.")
		}
		this.projectId = this.options.watsonxProjectId

		const serviceUrl = this.options.watsonxBaseUrl
		const platform = this.options.watsonxPlatform || "ibmCloud"

		try {
			const serviceOptions: Partial<WatsonxServiceOptions> = {
				version: "2024-05-31",
				serviceUrl: serviceUrl,
			}

			// Choose authenticator based on platform
			if (platform === "cloudPak") {
				const username = this.options.watsonxUsername
				if (!username) {
					throw new Error("You must provide a valid username for IBM Cloud Pak for Data.")
				}

				const authType = this.options.watsonxAuthType

				if (authType === "apiKey") {
					const apiKey = this.options.watsonxApiKey
					if (!apiKey) {
						throw new Error("You must provide a valid API key for IBM Cloud Pak for Data.")
					}

					serviceOptions.authenticator = new CloudPakForDataAuthenticator({
						username: username,
						apikey: apiKey,
						url: serviceUrl,
					})
				} else {
					const password = this.options.watsonxPassword
					if (!password) {
						throw new Error("You must provide a valid password for IBM Cloud Pak for Data.")
					}

					serviceOptions.authenticator = new CloudPakForDataAuthenticator({
						username: username,
						password: password,
						url: serviceUrl,
					})
				}
			} else {
				// Default to IBM Cloud with IAM authentication
				const apiKey = this.options.watsonxApiKey
				if (!apiKey) {
					throw new Error("You must provide a valid IBM watsonx API key.")
				}

				serviceOptions.authenticator = new IamAuthenticator({
					apikey: apiKey,
				})
			}

			this.service = WatsonXAI.newInstance(serviceOptions)
			this.service.getAuthenticator().authenticate()
		} catch (error) {
			throw new Error(
				`IBM watsonx Authentication Error: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Creates parameters for WatsonX text chat API
	 *
	 * @param projectId - The IBM watsonx project ID
	 * @param modelId - The model ID to use
	 * @param messages - The messages to send
	 * @returns The parameters object for the API call
	 */
	private createTextChatParams(
		projectId: string,
		modelId: string,
		messages: WatsonxMessage[],
	): WatsonxTextChatParams {
		const maxTokens = this.options.modelMaxTokens || 2048
		const temperature = this.options.modelTemperature || 0.7
		return {
			projectId,
			modelId,
			messages,
			maxTokens,
			temperature,
		}
	}

	/**
	 * Creates a message using the IBM watsonx API directly
	 *
	 * @param systemPrompt - The system prompt to use
	 * @param messages - The conversation messages
	 * @param metadata - Optional metadata for the request
	 * @returns An async generator that yields the response
	 */
	async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const { id: modelId } = this.getModel()

		try {
			// Convert messages to WatsonX format with system prompt
			const convertedMessages = convertToWatsonxAiMessages(messages)
			// Ensure all messages have string content
			const watsonxMessages: WatsonxMessage[] = [{ role: "system", content: systemPrompt }]

			for (const msg of convertedMessages) {
				let content = ""
				if (typeof msg.content === "string") {
					content = msg.content
				} else if (Array.isArray(msg.content)) {
					content = msg.content
						.map((part) => {
							if (typeof part === "string") {
								return part
							} else if ("text" in part) {
								return part.text
							}
							return ""
						})
						.join("")
				}
				watsonxMessages.push({
					role: msg.role,
					content: content,
				})
			}

			const params = this.createTextChatParams(this.projectId, modelId, watsonxMessages)
			let responseText = ""

			// Call the IBM watsonx API using textChat (non-streaming); can be changed to streaming..
			const response = await this.service.textChat(params)

			if (!response?.result?.choices?.[0]?.message?.content) {
				throw new Error("Invalid or empty response from IBM watsonx API")
			}

			responseText = response.result.choices[0].message.content

			yield {
				type: "text",
				text: responseText,
			}
		} catch (error) {
			await vscode.window.showErrorMessage(error.message)
			yield {
				type: "error",
				error: error.type,
				message: error.message,
			}
		}
	}

	/**
	 * Completes a prompt using the IBM watsonx API directly with textChat
	 *
	 * @param prompt - The prompt to complete
	 * @returns The generated text
	 * @throws Error if the API call fails
	 */
	async completePrompt(prompt: string): Promise<string> {
		try {
			const { id: modelId } = this.getModel()
			const messages: WatsonxMessage[] = [{ role: "user", content: prompt }]
			const params = this.createTextChatParams(this.projectId, modelId, messages)
			const response = await this.service.textChat(params)

			if (!response?.result?.choices?.[0]?.message?.content) {
				throw new Error("Invalid or empty response from IBM watsonx API")
			}
			return response.result.choices[0].message.content
		} catch (error) {
			throw new Error(`IBM watsonx completion error: ${error.message}`)
		}
	}

	/**
	 * Returns the model ID and model information for the current watsonx configuration
	 *
	 * @returns An object containing the model ID and model information
	 */
	override getModel(): { id: string; info: ModelInfo } {
		const modelId = this.options.watsonxModelId || watsonxAiDefaultModelId
		const modelInfo =
			modelId && modelId in watsonxAiModels ? watsonxAiModels[modelId as WatsonxAIModelId] : baseModelInfo
		return {
			id: modelId,
			info: modelInfo,
		}
	}
}
