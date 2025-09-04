import { ModelInfo } from "@roo-code/types"
import { IamAuthenticator, CloudPakForDataAuthenticator } from "ibm-cloud-sdk-core"
import { WatsonXAI } from "@ibm-cloud/watsonx-ai"

/**
 * Fetches available watsonx models
 *
 * @param apiKey - The watsonx API key (for IBM Cloud or Cloud Pak with API key auth)
 * @param embedded - Whether to fetch embedding models (true) or LLM models (false)
 * @param projectId - Optional project ID for watsonx
 * @param baseUrl - Optional base URL for the watsonx API
 * @param platform - Optional platform type (ibmCloud or cloudPak)
 * @param username - Optional username for Cloud Pak for Data
 * @param password - Optional password for Cloud Pak for Data (when using password auth)
 * @returns A promise resolving to an object with model IDs as keys and model info as values
 */
export async function getWatsonxModels(
	apiKey: string,
	embedded: boolean,
	projectId?: string,
	baseUrl?: string,
	platform: "ibmCloud" | "cloudPak" = "ibmCloud",
	username?: string,
	password?: string,
): Promise<Record<string, ModelInfo>> {
	try {
		let options: any = {
			version: "2024-05-31",
		}

		if (platform === "ibmCloud" || !platform) {
			if (apiKey) {
				options.authenticator = new IamAuthenticator({
					apikey: apiKey,
				})
			} else {
				return {}
			}
		} else if (platform === "cloudPak") {
			if (!baseUrl) {
				throw new Error("Base URL is required for IBM Cloud Pak for Data")
			}

			if (username) {
				if (password) {
					options.authenticator = new CloudPakForDataAuthenticator({
						url: baseUrl,
						username: username,
						password: password,
					})
				} else if (apiKey) {
					options.authenticator = new CloudPakForDataAuthenticator({
						url: baseUrl,
						username: username,
						apikey: apiKey,
					})
				}
			}
		}

		const service = WatsonXAI.newInstance(options)

		let knownModels: Record<string, ModelInfo> = {}

		try {
			const response = await service.listFoundationModelSpecs()

			if (response && response.result) {
				const result = response.result as any
				const modelsList = result.models || result.resources || result.foundation_models || []
				if (Array.isArray(modelsList)) {
					for (const model of modelsList) {
						const modelId = model.id || model.name || model.model_id
						const modelInfo = JSON.stringify(model).toLowerCase()
						if (modelId && !embedded && !modelInfo.includes("embed") && !modelInfo.includes("rtrvr")) {
							const contextWindow = model.context_length || model.max_input_tokens || 8192
							const maxTokens = model.max_output_tokens || Math.floor(contextWindow / 2)

							knownModels[modelId] = {
								contextWindow,
								maxTokens,
								supportsPromptCache: false,
							}
						} else {
							if (modelId && embedded && modelInfo.includes("embed") && modelInfo.includes("rtrvr")) {
								const contextWindow = model.context_length || model.max_input_tokens || 8192
								const maxTokens = model.max_output_tokens || Math.floor(contextWindow / 2)

								knownModels[modelId] = {
									contextWindow,
									maxTokens,
									supportsPromptCache: false,
								}
							}
						}
					}
				}
			}
		} catch (error) {
			console.warn("Error fetching models from IBM watsonx API:", error)
			return {}
		}
		return knownModels
	} catch (apiError) {
		console.error("Error fetching IBM watsonx models:", apiError)
		return {}
	}
}
