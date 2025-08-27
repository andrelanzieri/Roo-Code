import { IEmbedder, EmbeddingResponse, EmbedderInfo } from "../interfaces/embedder"
import { MAX_ITEM_TOKENS } from "../constants"
import { t } from "../../../i18n"
import { TelemetryEventName } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"
import { WatsonXAI } from "@ibm-cloud/watsonx-ai"
import { IamAuthenticator, CloudPakForDataAuthenticator } from "ibm-cloud-sdk-core"

/**
 * IBM watsonx embedder implementation using the native IBM Cloud watsonx.ai package.
 *
 * Supported models:
 * - ibm/slate-125m-english-rtrvr-v2 (dimension: 1536)
 */
export class WatsonxEmbedder implements IEmbedder {
	private readonly watsonxClient: WatsonXAI
	private static readonly WATSONX_VERSION = "2024-05-31"
	private static readonly WATSONX_REGION = "us-south"
	private static readonly DEFAULT_MODEL = "ibm/slate-125m-english-rtrvr-v2"
	private readonly modelId: string
	private readonly projectId?: string

	/**
	 * Creates a new watsonx embedder
	 * @param apiKey The watsonx API key for authentication
	 * @param modelId The model ID to use (defaults to ibm/slate-125m-english-rtrvr-v2)
	 * @param projectId Optional IBM Cloud project ID for watsonx
	 * @param platform Optional platform type (ibmCloud or cloudPak)
	 * @param baseUrl Optional base URL for the service (required for cloudPak)
	 * @param region Optional region for IBM Cloud (defaults to us-south)
	 * @param username Optional username for Cloud Pak for Data
	 * @param password Optional password for Cloud Pak for Data
	 */
	constructor(
		apiKey: string,
		modelId?: string,
		projectId?: string,
		platform: "ibmCloud" | "cloudPak" = "ibmCloud",
		baseUrl?: string,
		region: string = "us-south",
		username?: string,
		password?: string,
	) {
		if (!apiKey && !(username && password)) {
			throw new Error(t("embeddings:validation.apiKeyRequired"))
		}
		this.modelId = modelId || WatsonxEmbedder.DEFAULT_MODEL
		this.projectId = projectId

		let options: any = {
			version: WatsonxEmbedder.WATSONX_VERSION,
		}

		if (platform === "ibmCloud") {
			options.authenticator = new IamAuthenticator({
				apikey: apiKey,
			})
			options.serviceUrl = baseUrl || `https://${region}.ml.cloud.ibm.com`
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

			options.serviceUrl = baseUrl
		}

		this.watsonxClient = new WatsonXAI(options)

		try {
			this.watsonxClient.getAuthenticator().authenticate()
		} catch (error) {
			console.error("WatsonX authentication failed:", error)
			throw new Error(t("embeddings:validation.authenticationFailed"))
		}
	}

	/**
	 * Creates embeddings for the given texts using watsonx's embedding API
	 * @param texts Array of text strings to embed
	 * @param model Optional model identifier (uses constructor model if not provided)
	 * @returns Promise resolving to embedding response
	 */
	async createEmbeddings(texts: string[], model?: string): Promise<EmbeddingResponse> {
		const MAX_RETRIES = 3
		const INITIAL_DELAY_MS = 1000

		try {
			const modelToUse = model || this.modelId

			const embeddings: number[][] = []
			let promptTokens = 0
			let totalTokens = 0

			for (const text of texts) {
				if (!text.trim()) {
					embeddings.push([])
					continue
				}

				const estimatedTokens = Math.ceil(text.length / 4)
				if (estimatedTokens > MAX_ITEM_TOKENS) {
					console.warn(
						t("embeddings:textExceedsTokenLimit", {
							index: texts.indexOf(text),
							itemTokens: estimatedTokens,
							maxTokens: MAX_ITEM_TOKENS,
						}),
					)
					embeddings.push([])
					continue
				}

				let lastError
				for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
					try {
						const response = await this.watsonxClient.embedText({
							modelId: modelToUse,
							inputs: [text],
							projectId: this.projectId,
							parameters: {
								truncate_input_tokens: MAX_ITEM_TOKENS,
								return_options: {
									input_text: true,
								},
							},
						})

						if (response.result && response.result.results && response.result.results.length > 0) {
							embeddings.push(response.result.results[0].embedding)

							if (response.result.input_token_count) {
								promptTokens += response.result.input_token_count
								totalTokens += response.result.input_token_count
							}
							break
						} else {
							embeddings.push([])
							break
						}
					} catch (error) {
						lastError = error

						if (attempt < MAX_RETRIES - 1) {
							const delayMs = INITIAL_DELAY_MS * Math.pow(2, attempt)
							console.warn(
								`IBM watsonx API call failed, retrying in ${delayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`,
							)
							await new Promise((resolve) => setTimeout(resolve, delayMs))
						}
					}
				}

				if (lastError && embeddings.length < texts.indexOf(text) + 1) {
					embeddings.push([])
					console.error(`Failed to embed text after ${MAX_RETRIES} attempts:`, lastError)
				}
			}

			return {
				embeddings,
				usage: {
					promptTokens,
					totalTokens,
				},
			}
		} catch (error) {
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "WatsonxEmbedder:createEmbeddings",
			})
			throw error
		}
	}

	/**
	 * Validates the watsonx embedder configuration by testing the API key and connection
	 * @returns Promise resolving to validation result with success status and optional error message
	 */
	async validateConfiguration(): Promise<{ valid: boolean; error?: string }> {
		try {
			const testText = "test"

			console.log("Testing IBM watsonx.ai configuration with model:", this.modelId)

			const response = await this.watsonxClient.embedText({
				modelId: this.modelId,
				inputs: [testText],
				projectId: this.projectId,
				parameters: {
					truncate_input_tokens: MAX_ITEM_TOKENS,
					return_options: {
						input_text: true,
					},
				},
			})

			if (!response?.result?.results || response.result.results.length === 0) {
				console.error("IBM watsonx validation failed: Invalid response format", response)
				return {
					valid: false,
					error: "embeddings:validation.invalidResponse",
				}
			}

			console.log("IBM watsonx configuration validated successfully")
			return { valid: true }
		} catch (error) {
			console.error("IBM watsonx validation error:", error)
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				location: "WatsonxEmbedder:validateConfiguration",
			})

			let errorMessage = "embeddings:validation.unknownError"
			let errorDetails = ""

			if (error instanceof Error) {
				errorDetails = error.message
				if (error.message.includes("401") || error.message.includes("unauthorized")) {
					errorMessage = "embeddings:validation.invalidApiKey"
				} else if (error.message.includes("404") || error.message.includes("not found")) {
					errorMessage = "embeddings:validation.endpointNotFound"
				} else if (error.message.includes("timeout") || error.message.includes("ECONNREFUSED")) {
					errorMessage = "embeddings:validation.connectionTimeout"
				} else if (error.message.includes("project")) {
					errorMessage = "embeddings:validation.invalidProjectId"
				} else if (error.message.includes("model")) {
					errorMessage = "embeddings:validation.invalidModelId"
				}
			}

			return {
				valid: false,
				error: `${errorMessage} (${errorDetails})`,
			}
		}
	}

	/**
	 * Fetches available embedding models from the IBM watsonx API
	 * @returns Promise resolving to an object with model IDs as keys and model info as values
	 */
	async getAvailableModels(): Promise<Record<string, { dimension: number }>> {
		try {
			console.log("Fetching available IBM watsonx embedding models...")

			const knownModels: Record<string, { dimension: number }> = {
				"ibm/slate-125m-english-rtrvr-v2": { dimension: 1536 },
			}

			try {
				const response = await this.watsonxClient.listFoundationModelSpecs()

				console.log(
					"IBM watsonx API response structure:",
					Object.keys(response || {}).join(", "),
					Object.keys(response?.result || {}).join(", "),
				)

				if (response && response.result) {
					const result = response.result as any

					const modelsList = result.models || result.resources || result.foundation_models || []

					if (Array.isArray(modelsList)) {
						for (const model of modelsList) {
							const modelId = model.id || model.name || model.model_id
							const modelInfo = JSON.stringify(model).toLowerCase()
							if (
								modelId &&
								(modelInfo.includes("embed") ||
									modelInfo.includes("rtrvr") ||
									modelInfo.includes("retriev"))
							) {
								const dimension = model.dimension || model.vector_size || model.embedding_size || 1536
								knownModels[modelId] = { dimension }
							}
						}
					}
				}
			} catch (apiError) {
				console.warn("Error fetching models from IBM watsonx API:", apiError)
			}

			console.log(`Found ${Object.keys(knownModels).length} IBM watsonx embedding models`)
			return knownModels
		} catch (error) {
			console.error("Error in getAvailableModels:", error)
			return {
				"ibm/slate-125m-english-rtrvr-v2": { dimension: 768 },
			}
		}
	}

	/**
	 * Returns information about this embedder
	 */
	get embedderInfo(): EmbedderInfo {
		return {
			name: "watsonx",
		}
	}
}
