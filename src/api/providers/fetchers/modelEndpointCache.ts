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

// Coalesce concurrent endpoint fetches per (router,modelId)
const inFlightEndpointFetches = new Map<string, Promise<ModelRecord>>()

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
		// Using console.log for cache layer logging (no provider access in utility functions)
		console.log(`[endpointCache] cache_hit: ${key} (${Object.keys(cached).length} endpoints)`)
		return cached
	}

	// 2) Try file cache snapshot (Option A), then kick off background refresh
	try {
		const file = await readModelEndpoints(key)
		if (file && Object.keys(file).length > 0) {
			// Using console.log for cache layer logging (no provider access in utility functions)
			console.log(`[endpointCache] file_hit: ${key} (${Object.keys(file).length} endpoints, bg_refresh queued)`)
			// Populate memory cache immediately
			memoryCache.set(key, file)

			// Start background refresh if not already in-flight (do not await)
			if (!inFlightEndpointFetches.has(key)) {
				const signal = AbortSignal.timeout(30_000)
				const bgPromise = (async (): Promise<ModelRecord> => {
					const modelProviders = await getOpenRouterModelEndpoints(modelId, undefined, signal)
					if (Object.keys(modelProviders).length > 0) {
						console.log(
							`[endpointCache] bg_refresh_done: ${key} (${Object.keys(modelProviders).length} endpoints)`,
						)
						memoryCache.set(key, modelProviders)
						try {
							await writeModelEndpoints(key, modelProviders)
						} catch (error) {
							console.error(
								`[endpointCache] Error writing ${key} to file cache during background refresh:`,
								error instanceof Error ? error.message : String(error),
							)
						}
						return modelProviders
					}
					return {}
				})()

				inFlightEndpointFetches.set(key, bgPromise)
				Promise.resolve(bgPromise)
					.catch((err) => {
						// Log background refresh failures for monitoring
						console.error(
							`[endpointCache] Background refresh failed for ${key}:`,
							err instanceof Error ? err.message : String(err),
						)
					})
					.finally(() => inFlightEndpointFetches.delete(key))
			}

			return file
		}
	} catch {
		// ignore file read errors; fall through
	}

	// 3) Coalesce concurrent fetches
	const inFlight = inFlightEndpointFetches.get(key)
	if (inFlight) {
		// Using console.log for cache layer logging (no provider access in utility functions)
		console.log(`[endpointCache] coalesced_wait: ${key}`)
		return inFlight
	}

	// 4) Single network fetch for this key
	const signal = AbortSignal.timeout(30_000)
	const fetchPromise = (async (): Promise<ModelRecord> => {
		let modelProviders: ModelRecord = {}
		modelProviders = await getOpenRouterModelEndpoints(modelId, undefined, signal)

		if (Object.keys(modelProviders).length > 0) {
			console.log(`[endpointCache] network_fetch_done: ${key} (${Object.keys(modelProviders).length} endpoints)`)
			// Update memory cache first
			memoryCache.set(key, modelProviders)

			// Best-effort persist
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
	})()

	inFlightEndpointFetches.set(key, fetchPromise)
	try {
		return await fetchPromise
	} finally {
		inFlightEndpointFetches.delete(key)
	}
}

export const flushModelProviders = async (router: RouterName, modelId: string) =>
	memoryCache.del(getCacheKey(router, modelId))
