import * as path from "path"
import fs from "fs/promises"

import NodeCache from "node-cache"

import { safeWriteJson } from "../../../utils/safeWriteJson"

import { ContextProxy } from "../../../core/config/ContextProxy"
import { getCacheDirectoryPath } from "../../../utils/storage"
import type { RouterName, ModelRecord } from "../../../shared/api"
import { fileExistsAtPath } from "../../../utils/fs"

import { getOpenRouterModels } from "./openrouter"
import { getVercelAiGatewayModels } from "./vercel-ai-gateway"
import { getRequestyModels } from "./requesty"
import { getGlamaModels } from "./glama"
import { getUnboundModels } from "./unbound"
import { getLiteLLMModels } from "./litellm"
import { GetModelsOptions } from "../../../shared/api"
import { getOllamaModels } from "./ollama"
import { getLMStudioModels } from "./lmstudio"
import { getIOIntelligenceModels } from "./io-intelligence"
import { getDeepInfraModels } from "./deepinfra"
import { getHuggingFaceModels } from "./huggingface"
import { getRooModels } from "./roo"

const memoryCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 5 * 60 })

async function writeModels(router: RouterName, data: ModelRecord) {
	const filename = `${router}_models.json`
	const cacheDir = await getCacheDirectoryPath(ContextProxy.instance.globalStorageUri.fsPath)
	await safeWriteJson(path.join(cacheDir, filename), data)
}

async function readModels(router: RouterName): Promise<ModelRecord | undefined> {
	const filename = `${router}_models.json`
	const cacheDir = await getCacheDirectoryPath(ContextProxy.instance.globalStorageUri.fsPath)
	const filePath = path.join(cacheDir, filename)
	const exists = await fileExistsAtPath(filePath)
	return exists ? JSON.parse(await fs.readFile(filePath, "utf8")) : undefined
}

/**
 * Get models from the cache or fetch them from the provider and cache them.
 * There are two caches:
 * 1. Memory cache - This is a simple in-memory cache that is used to store models for a short period of time.
 * 2. File cache - This is a file-based cache that is used to store models for a longer period of time.
 *
 * @param router - The router to fetch models from.
 * @param apiKey - Optional API key for the provider.
 * @param baseUrl - Optional base URL for the provider (currently used only for LiteLLM).
 * @returns The models from the cache or the fetched models.
 */
export const getModels = async (options: GetModelsOptions): Promise<ModelRecord> => {
	const { provider } = options

	// 1) Try memory cache
	const cached = getModelsFromCache(provider)
	if (cached) {
		return cached
	}

	// 2) Try file cache snapshot
	try {
		const file = await readModels(provider)
		if (file && Object.keys(file).length > 0) {
			memoryCache.set(provider, file)
			return file
		}
	} catch {
		// ignore file read errors; fall through to network fetch
	}

	// 3) Network fetch
	const signal = AbortSignal.timeout(30_000)
	let models: ModelRecord = {}

	switch (provider) {
		case "openrouter":
			models = await getOpenRouterModels(undefined, signal)
			break
		case "requesty":
			models = await getRequestyModels(options.baseUrl, options.apiKey, signal)
			break
		case "glama":
			models = await getGlamaModels(signal)
			break
		case "unbound":
			models = await getUnboundModels(options.apiKey, signal)
			break
		case "litellm":
			models = await getLiteLLMModels(options.apiKey as string, options.baseUrl as string, signal)
			break
		case "ollama":
			models = await getOllamaModels(options.baseUrl, options.apiKey, signal)
			break
		case "lmstudio":
			models = await getLMStudioModels(options.baseUrl, signal)
			break
		case "deepinfra":
			models = await getDeepInfraModels(options.apiKey, options.baseUrl, signal)
			break
		case "io-intelligence":
			models = await getIOIntelligenceModels(options.apiKey, signal)
			break
		case "vercel-ai-gateway":
			models = await getVercelAiGatewayModels(undefined, signal)
			break
		case "huggingface":
			models = await getHuggingFaceModels(signal)
			break
		case "roo": {
			const rooBaseUrl = options.baseUrl ?? process.env.ROO_CODE_PROVIDER_URL ?? "https://api.roocode.com/proxy"
			models = await getRooModels(rooBaseUrl, options.apiKey, signal)
			break
		}
		default: {
			throw new Error(`Unknown provider: ${provider}`)
		}
	}

	memoryCache.set(provider, models)

	await writeModels(provider, models).catch((err) => {
		console.error(
			`[modelCache] Error writing ${provider} to file cache after network fetch:`,
			err instanceof Error ? err.message : String(err),
		)
	})

	return models || {}
}

/**
 * Flush models memory cache for a specific router.
 *
 * @param router - The router to flush models for.
 */
export const flushModels = async (router: RouterName) => {
	memoryCache.del(router)
}

export function getModelsFromCache(provider: RouterName) {
	return memoryCache.get<ModelRecord>(provider)
}
