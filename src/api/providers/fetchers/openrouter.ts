import axios from "axios"
import { z } from "zod"

import {
	type ModelInfo,
	isModelParameter,
	OPEN_ROUTER_REASONING_BUDGET_MODELS,
	OPEN_ROUTER_REQUIRED_REASONING_BUDGET_MODELS,
	anthropicModels,
} from "@roo-code/types"

import type { ApiHandlerOptions } from "../../../shared/api"
import { parseApiPrice } from "../../../shared/cost"

/**
 * OpenRouterBaseModel
 */

const openRouterArchitectureSchema = z.object({
	input_modalities: z.array(z.string()).nullish(),
	output_modalities: z.array(z.string()).nullish(),
	tokenizer: z.string().nullish(),
})

const openRouterPricingSchema = z.object({
	prompt: z.string().nullish(),
	completion: z.string().nullish(),
	input_cache_write: z.string().nullish(),
	input_cache_read: z.string().nullish(),
})

const modelRouterBaseModelSchema = z.object({
	name: z.string(),
	description: z.string().optional(),
	context_length: z.number(),
	max_completion_tokens: z.number().nullish(),
	pricing: openRouterPricingSchema.optional(),
})

export type OpenRouterBaseModel = z.infer<typeof modelRouterBaseModelSchema>

/**
 * OpenRouterModel
 */

export const openRouterModelSchema = modelRouterBaseModelSchema.extend({
	id: z.string(),
	architecture: openRouterArchitectureSchema.optional(),
	top_provider: z.object({ max_completion_tokens: z.number().nullish() }).optional(),
	supported_parameters: z.array(z.string()).optional(),
})

export type OpenRouterModel = z.infer<typeof openRouterModelSchema>

/**
 * OpenRouterModelEndpoint
 */

export const openRouterModelEndpointSchema = modelRouterBaseModelSchema.extend({
	provider_name: z.string(),
	tag: z.string().optional(),
})

export type OpenRouterModelEndpoint = z.infer<typeof openRouterModelEndpointSchema>

/**
 * OpenRouterModelsResponse
 */

const openRouterModelsResponseSchema = z.object({
	data: z.array(openRouterModelSchema),
})

type OpenRouterModelsResponse = z.infer<typeof openRouterModelsResponseSchema>

/**
 * OpenRouterModelEndpointsResponse
 */

const openRouterModelEndpointsResponseSchema = z.object({
	data: z.object({
		id: z.string(),
		name: z.string(),
		description: z.string().optional(),
		architecture: openRouterArchitectureSchema.optional(),
		supported_parameters: z.array(z.string()).optional(),
		endpoints: z.array(openRouterModelEndpointSchema),
	}),
})

type OpenRouterModelEndpointsResponse = z.infer<typeof openRouterModelEndpointsResponseSchema>

/**
 * getOpenRouterModels
 */

export async function getOpenRouterModels(options?: ApiHandlerOptions): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}
	const baseURL = options?.openRouterBaseUrl || "https://openrouter.ai/api/v1"

	try {
		const response = await axios.get<OpenRouterModelsResponse>(`${baseURL}/models`)
		const result = openRouterModelsResponseSchema.safeParse(response.data)
		const data = result.success ? result.data.data : response.data.data

		if (!result.success) {
			console.error("OpenRouter models response is invalid", result.error.format())
		}

		for (const model of data) {
			const { id, architecture, top_provider, supported_parameters = [] } = model

			// Skip image generation models (models that output images)
			if (architecture?.output_modalities?.includes("image")) {
				continue
			}

			models[id] = parseOpenRouterModel({
				id,
				model,
				inputModality: architecture?.input_modalities,
				outputModality: architecture?.output_modalities,
				maxTokens: top_provider?.max_completion_tokens,
				supportedParameters: supported_parameters,
			})
		}
	} catch (error) {
		console.error(
			`Error fetching OpenRouter models: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}

	return models
}

/**
 * getOpenRouterModelEndpoints
 */

export async function getOpenRouterModelEndpoints(
	modelId: string,
	options?: ApiHandlerOptions,
): Promise<Record<string, ModelInfo>> {
	const models: Record<string, ModelInfo> = {}
	const baseURL = options?.openRouterBaseUrl || "https://openrouter.ai/api/v1"

	try {
		const response = await axios.get<OpenRouterModelEndpointsResponse>(`${baseURL}/models/${modelId}/endpoints`)
		const result = openRouterModelEndpointsResponseSchema.safeParse(response.data)
		const data = result.success ? result.data.data : response.data.data

		if (!result.success) {
			console.error("OpenRouter model endpoints response is invalid", result.error.format())
		}

		const { id, architecture, endpoints } = data

		// Skip image generation models (models that output images)
		if (architecture?.output_modalities?.includes("image")) {
			return models
		}

		for (const endpoint of endpoints) {
			models[endpoint.tag ?? endpoint.provider_name] = parseOpenRouterModel({
				id,
				model: endpoint,
				inputModality: architecture?.input_modalities,
				outputModality: architecture?.output_modalities,
				maxTokens: endpoint.max_completion_tokens,
			})
		}
	} catch (error) {
		console.error(
			`Error fetching OpenRouter model endpoints: ${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`,
		)
	}

	return models
}

/**
 * parseOpenRouterModel
 */

export const parseOpenRouterModel = ({
	id,
	model,
	inputModality,
	outputModality,
	maxTokens,
	supportedParameters,
}: {
	id: string
	model: OpenRouterBaseModel
	inputModality: string[] | null | undefined
	outputModality: string[] | null | undefined
	maxTokens: number | null | undefined
	supportedParameters?: string[]
}): ModelInfo => {
	const cacheWritesPrice = model.pricing?.input_cache_write
		? parseApiPrice(model.pricing?.input_cache_write)
		: undefined

	const cacheReadsPrice = model.pricing?.input_cache_read ? parseApiPrice(model.pricing?.input_cache_read) : undefined

	const supportsPromptCache = typeof cacheReadsPrice !== "undefined" // some models support caching but don't charge a cacheWritesPrice, e.g. GPT-5

	const modelInfo: ModelInfo = {
		maxTokens: maxTokens || Math.ceil(model.context_length * 0.2),
		contextWindow: model.context_length,
		supportsImages: inputModality?.includes("image") ?? false,
		supportsPromptCache,
		inputPrice: parseApiPrice(model.pricing?.prompt),
		outputPrice: parseApiPrice(model.pricing?.completion),
		cacheWritesPrice,
		cacheReadsPrice,
		description: model.description,
		supportsReasoningEffort: supportedParameters ? supportedParameters.includes("reasoning") : undefined,
		supportedParameters: supportedParameters ? supportedParameters.filter(isModelParameter) : undefined,
	}

	if (OPEN_ROUTER_REASONING_BUDGET_MODELS.has(id)) {
		modelInfo.supportsReasoningBudget = true
	}

	if (OPEN_ROUTER_REQUIRED_REASONING_BUDGET_MODELS.has(id)) {
		modelInfo.requiredReasoningBudget = true
	}

	// For backwards compatibility with the old model definitions we will
	// continue to disable extending thinking for anthropic/claude-3.7-sonnet
	// and force it for anthropic/claude-3.7-sonnet:thinking.

	if (id === "anthropic/claude-3.7-sonnet") {
		modelInfo.maxTokens = anthropicModels["claude-3-7-sonnet-20250219"].maxTokens
		modelInfo.supportsReasoningBudget = false
		modelInfo.supportsReasoningEffort = false
	}

	if (id === "anthropic/claude-3.7-sonnet:thinking") {
		modelInfo.maxTokens = anthropicModels["claude-3-7-sonnet-20250219:thinking"].maxTokens
	}

	// Set claude-opus-4.1 model to use the correct configuration
	if (id === "anthropic/claude-opus-4.1") {
		modelInfo.maxTokens = anthropicModels["claude-opus-4-1-20250805"].maxTokens
	}

	// Ensure correct reasoning handling for Claude Haiku 4.5 on OpenRouter
	// Use budget control and disable effort-based reasoning fallback
	if (id === "anthropic/claude-haiku-4.5") {
		modelInfo.supportsReasoningBudget = true
		modelInfo.supportsReasoningEffort = false
	}

	// Set horizon-alpha model to 32k max tokens
	if (id === "openrouter/horizon-alpha") {
		modelInfo.maxTokens = 32768
	}

	// Set horizon-beta model to 32k max tokens
	if (id === "openrouter/horizon-beta") {
		modelInfo.maxTokens = 32768
	}

	// Add tiered pricing for Gemini 2.5 Pro models on OpenRouter
	if (id.includes("gemini-2.5-pro") || id.includes("gemini/2.5-pro")) {
		modelInfo.inputPrice = 1.25
		modelInfo.outputPrice = 10
		modelInfo.cacheReadsPrice = 0.125
		modelInfo.cacheWritesPrice = 1.625
		modelInfo.tiers = [
			{
				contextWindow: 1_000_000,
				inputPrice: 2.5,
				outputPrice: 15,
				cacheReadsPrice: 0.25,
				cacheWritesPrice: 2.875,
			},
		]
	}

	// Add tiered pricing for Claude Sonnet 4 and 4.5 on OpenRouter
	if (id === "anthropic/claude-sonnet-4" || id === "anthropic/claude-sonnet-4.5") {
		modelInfo.inputPrice = 3.0
		modelInfo.outputPrice = 15.0
		modelInfo.cacheWritesPrice = 3.75
		modelInfo.cacheReadsPrice = 0.3
		modelInfo.tiers = [
			{
				contextWindow: 1_000_000,
				inputPrice: 6.0,
				outputPrice: 22.5,
				cacheWritesPrice: 7.5,
				cacheReadsPrice: 0.6,
			},
		]
	}

	// Add tiered pricing for Qwen 3 Max on OpenRouter
	if (id.toLowerCase().includes("qwen") && id.toLowerCase().includes("max")) {
		modelInfo.inputPrice = 1.2
		modelInfo.outputPrice = 6
		modelInfo.cacheReadsPrice = 0.24
		modelInfo.cacheWritesPrice = 0 // Free
		modelInfo.tiers = [
			{
				contextWindow: 1_000_000,
				inputPrice: 3,
				outputPrice: 15,
				cacheReadsPrice: 0.6,
				cacheWritesPrice: 0, // Free
			},
		]
	}

	return modelInfo
}
