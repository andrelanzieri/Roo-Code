import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk"
import { ModelInfo, watsonxAiDefaultModelId, watsonxAiModels, WatsonxAIModelId } from "@roo-code/types"
import type { ApiHandlerOptions } from "../../shared/api"
import { IamAuthenticator, CloudPakForDataAuthenticator } from "ibm-cloud-sdk-core"
import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { WatsonXAI } from "@ibm-cloud/watsonx-ai"
import { convertToWatsonxAiMessages } from "../transform/watsonxai-format"
import { calculateApiCostOpenAI } from "../../shared/cost"

export class WatsonxAIHandler extends BaseProvider implements SingleCompletionHandler {
	private options: ApiHandlerOptions
	private projectId?: string
	private service: WatsonXAI

	constructor(options: ApiHandlerOptions) {
		super()
		this.options = options

		this.projectId = (this.options as any).watsonxProjectId
		if (!this.projectId) {
			throw new Error("You must provide a valid IBM watsonx project ID.")
		}

		const serviceUrl = (this.options as any).watsonxBaseUrl
		const platform = (this.options as any).watsonxPlatform

		try {
			const serviceOptions: any = {
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
	private createTextChatParams(projectId: string, modelId: string, messages: any[]) {
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
			const watsonxMessages = [{ role: "system", content: systemPrompt }, ...convertToWatsonxAiMessages(messages)]

			const params = this.createTextChatParams(this.projectId!, modelId, watsonxMessages)
			let responseText = ""
			let usageInfo: any = null

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

			usageInfo = response.result.usage || {}
			const outputTokens = usageInfo.completion_tokens

			const inputTokens = usageInfo?.prompt_tokens || 0
			const modelInfo = this.getModel().info
			const totalCost = calculateApiCostOpenAI(modelInfo, inputTokens, outputTokens)

			yield {
				type: "usage",
				inputTokens: inputTokens,
				outputTokens,
				totalCost: totalCost,
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
			const messages = [{ role: "user", content: prompt }]
			const params = this.createTextChatParams(this.projectId!, modelId, messages)
			const response = await this.service.textChat(params)

			if (!response?.result?.choices?.[0]?.message?.content) {
				throw new Error("Invalid or empty response from IBM watsonx API")
			}

			// Extract the message content directly
			return response.result.choices[0].message.content
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`IBM watsonx completion error: ${error.message}`)
			}
			throw new Error(`IBM watsonx completion error: ${error.message}`)
		}
	}

	/**
	 * Returns the model ID and model information for the current watsonx configuration
	 *
	 * @returns An object containing the model ID and model information
	 */
	override getModel(): { id: string; info: ModelInfo } {
		return {
			id: (this.options as any).watsonxModelId || watsonxAiDefaultModelId,
			info: watsonxAiModels[(this.options as any).watsonxModelId as WatsonxAIModelId] || "",
		}
	}
}
