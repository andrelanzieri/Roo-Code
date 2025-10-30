import type { ProviderSettings } from "@roo-code/types"
import { CloudService } from "@roo-code/cloud"
import type { RouterName, ModelRecord, GetModelsOptions } from "../../shared/api"
import { getModels } from "../../api/providers/fetchers/modelCache"

export interface RouterModelsFetchOptions {
	apiConfiguration: ProviderSettings
	activeProviderOnly?: boolean
	litellmOverrides?: {
		apiKey?: string
		baseUrl?: string
	}
}

export interface RouterModelsFetchResult {
	routerModels: Partial<Record<RouterName, ModelRecord>>
	errors: Array<{
		provider: RouterName
		error: string
	}>
}

/**
 * Builds the list of provider fetch options based on configuration and mode.
 */
function buildProviderFetchList(
	options: RouterModelsFetchOptions,
): Array<{ key: RouterName; options: GetModelsOptions }> {
	const { apiConfiguration, activeProviderOnly, litellmOverrides } = options

	const allFetches: Array<{ key: RouterName; options: GetModelsOptions }> = [
		{ key: "openrouter", options: { provider: "openrouter" } },
		{
			key: "requesty",
			options: {
				provider: "requesty",
				apiKey: apiConfiguration.requestyApiKey,
				baseUrl: apiConfiguration.requestyBaseUrl,
			},
		},
		{ key: "glama", options: { provider: "glama" } },
		{ key: "unbound", options: { provider: "unbound", apiKey: apiConfiguration.unboundApiKey } },
		{ key: "vercel-ai-gateway", options: { provider: "vercel-ai-gateway" } },
		{
			key: "deepinfra",
			options: {
				provider: "deepinfra",
				apiKey: apiConfiguration.deepInfraApiKey,
				baseUrl: apiConfiguration.deepInfraBaseUrl,
			},
		},
		{
			key: "roo",
			options: {
				provider: "roo",
				baseUrl: process.env.ROO_CODE_PROVIDER_URL ?? "https://api.roocode.com/proxy",
				apiKey: CloudService.hasInstance() ? CloudService.instance.authService?.getSessionToken() : undefined,
			},
		},
	]

	// Include local providers when in active-provider mode and they are selected
	if (activeProviderOnly) {
		const activeProvider = apiConfiguration.apiProvider

		if (activeProvider === "ollama") {
			allFetches.push({
				key: "ollama",
				options: {
					provider: "ollama",
					baseUrl: apiConfiguration.ollamaBaseUrl,
					apiKey: apiConfiguration.ollamaApiKey,
				},
			})
		}
		if (activeProvider === "lmstudio") {
			allFetches.push({
				key: "lmstudio",
				options: {
					provider: "lmstudio",
					baseUrl: apiConfiguration.lmStudioBaseUrl,
				},
			})
		}
		if (activeProvider === "huggingface") {
			allFetches.push({
				key: "huggingface",
				options: {
					provider: "huggingface",
				},
			})
		}
	}

	// Add IO Intelligence if API key is provided
	if (apiConfiguration.ioIntelligenceApiKey) {
		allFetches.push({
			key: "io-intelligence",
			options: { provider: "io-intelligence", apiKey: apiConfiguration.ioIntelligenceApiKey },
		})
	}

	// Add LiteLLM if configured (with potential overrides from message)
	const litellmApiKey = apiConfiguration.litellmApiKey || litellmOverrides?.apiKey
	const litellmBaseUrl = apiConfiguration.litellmBaseUrl || litellmOverrides?.baseUrl
	if (litellmApiKey && litellmBaseUrl) {
		allFetches.push({
			key: "litellm",
			options: { provider: "litellm", apiKey: litellmApiKey, baseUrl: litellmBaseUrl },
		})
	}

	return allFetches
}

/**
 * Fetches router models based on the provided options.
 * Can fetch all providers or only the active provider.
 */
export async function fetchRouterModels(options: RouterModelsFetchOptions): Promise<RouterModelsFetchResult> {
	const { apiConfiguration, activeProviderOnly } = options

	// Initialize empty results for all providers
	const routerModels: Partial<Record<RouterName, ModelRecord>> = {
		openrouter: {},
		"vercel-ai-gateway": {},
		huggingface: {},
		litellm: {},
		deepinfra: {},
		"io-intelligence": {},
		requesty: {},
		unbound: {},
		glama: {},
		ollama: {},
		lmstudio: {},
		roo: {},
	}

	const errors: Array<{ provider: RouterName; error: string }> = []

	// Build fetch list
	const fetchList = buildProviderFetchList(options)

	// Filter to active provider if requested
	const activeProvider = apiConfiguration.apiProvider as RouterName | undefined
	const modelFetchPromises =
		activeProviderOnly && activeProvider ? fetchList.filter(({ key }) => key === activeProvider) : fetchList

	// Execute fetches
	const results = await Promise.allSettled(
		modelFetchPromises.map(async ({ key, options }) => {
			const models = await getModels(options)
			return { key, models }
		}),
	)

	// Process results
	results.forEach((result, index) => {
		const routerName = modelFetchPromises[index].key

		if (result.status === "fulfilled") {
			routerModels[routerName] = result.value.models
		} else {
			const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason)
			routerModels[routerName] = {}
			errors.push({ provider: routerName, error: errorMessage })
		}
	})

	return { routerModels, errors }
}
