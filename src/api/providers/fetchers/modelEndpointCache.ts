import * as path from "path"
import fs from "fs/promises"

import NodeCache from "node-cache"
import { safeWriteJson } from "../../../utils/safeWriteJson"
import sanitize from "sanitize-filename"

import { ContextProxy } from "../../../core/config/ContextProxy"
import { getCacheDirectoryPath } from "../../../utils/storage"
import { RouterName, ModelRecord } from "../../../shared/api"
import { fileExistsAtPath } from "../../../utils/fs"

import { getOpenRouterModelEndpoints } from "./openrouter"

const memoryCache = new NodeCache({ stdTTL: 5 * 60, checkperiod: 5 * 60 })

const getCacheKey = (router: RouterName, modelId: string) => sanitize(`${router}_${modelId}`)

async function writeModelEndpoints(key: string, data: ModelRecord) {
	const filename = `${key}_endpoints.json`
	const cacheDir = await getCacheDirectoryPath(ContextProxy.instance.globalStorageUri.fsPath)
	await safeWriteJson(path.join(cacheDir, filename), data)
}

async function readModelEndpoints(key: string): Promise<ModelRecord | undefined> {
	const filename = `${key}_endpoints.json`
	const cacheDir = await getCacheDirectoryPath(ContextProxy.instance.globalStorageUri.fsPath)
	const filePath = path.join(cacheDir, filename)
	const exists = await fileExistsAtPath(filePath)
	return exists ? JSON.parse(await fs.readFile(filePath, "utf8")) : undefined
}

export const getModelEndpoints = async ({
	router,
	modelId,
	endpoint,
}: {
	router: RouterName
	modelId?: string
	endpoint?: string
}): Promise<ModelRecord> => {
	// OpenRouter is the only provider that supports model endpoints, but you
	// can see how we'd extend this to other providers in the future.
	if (router !== "openrouter" || !modelId || !endpoint) {
		return {}
	}

	const key = getCacheKey(router, modelId)

	// 1) Try memory cache
	const cached = memoryCache.get<ModelRecord>(key)
	if (cached) {
		return cached
	}

	// 2) Try file cache snapshot
	try {
		const file = await readModelEndpoints(key)
		if (file && Object.keys(file).length > 0) {
			memoryCache.set(key, file)
			return file
		}
	} catch {
		// ignore file read errors; fall through to network fetch
	}

	// 3) Network fetch
	const signal = AbortSignal.timeout(30_000)
	let modelProviders: ModelRecord = {}

	modelProviders = await getOpenRouterModelEndpoints(modelId, undefined, signal)

	if (Object.keys(modelProviders).length > 0) {
		memoryCache.set(key, modelProviders)

		try {
			await writeModelEndpoints(key, modelProviders)
		} catch (error) {
			console.error(
				`[endpointCache] Error writing ${key} to file cache after network fetch:`,
				error instanceof Error ? error.message : String(error),
			)
		}

		return modelProviders
	}

	// Fallback to file cache if network returned empty (rare)
	try {
		const file = await readModelEndpoints(key)
		return file ?? {}
	} catch {
		return {}
	}
}

export const flushModelProviders = async (router: RouterName, modelId: string) =>
	memoryCache.del(getCacheKey(router, modelId))
