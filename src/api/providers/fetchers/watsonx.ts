import { ModelInfo } from "@roo-code/types"
import { IamAuthenticator } from "ibm-cloud-sdk-core"
import { WatsonXAI } from "@ibm-cloud/watsonx-ai"

/**
 * Fetches available watsonx models
 *
 * @param apiKey - The watsonx API key
 * @param projectId - Optional project ID for watsonx
 * @param baseUrl - Optional base URL for the watsonx API
 * @returns A promise resolving to an object with model IDs as keys and model info as values
 */
export async function getWatsonxModels(
	apiKey: string,
	projectId?: string,
	baseUrl?: string,
): Promise<Record<string, ModelInfo>> {
	try {
		const service = WatsonXAI.newInstance({
			version: "2024-05-31",
			serviceUrl: baseUrl || "https://us-south.ml.cloud.ibm.com",
			authenticator: new IamAuthenticator({
				apikey: apiKey,
			}),
		})

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
						if (modelId && !modelInfo.includes("embed") && !modelInfo.includes("rtrvr")) {
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
		} catch (apiError) {
			console.warn("Error fetching models from IBM watsonx API:", apiError)
		}

		return knownModels
	} catch (error) {
		console.error("Error fetching IBM watsonx models:", error)
		return {}
	}
}
