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

function withTimeout<T>(p: Promise<T>, ms: number, label = "getModelEndpoints"): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const t = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
		p.then((v) => {
			clearTimeout(t)
			resolve(v)
		}).catch((e) => {
			clearTimeout(t)
			reject(e)
		})
	})
}

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
		console.log(`[endpointCache] cache_hit: ${key} (${Object.keys(cached).length} endpoints)`)
		return cached
	}

	// 2) Try file cache snapshot (Option A), then kick off background refresh
	try {
		const file = await readModelEndpoints(key)
		if (file && Object.keys(file).length > 0) {
			console.log(`[endpointCache] file_hit: ${key} (${Object.keys(file).length} endpoints, bg_refresh queued)`)
			// Populate memory cache immediately
			memoryCache.set(key, file)

			// Start background refresh if not already in-flight (do not await)
			if (!inFlightEndpointFetches.has(key)) {
				const bgPromise = (async (): Promise<ModelRecord> => {
					try {
						const modelProviders = await getOpenRouterModelEndpoints(modelId)
						if (Object.keys(modelProviders).length > 0) {
							console.log(
								`[endpointCache] bg_refresh_done: ${key} (${Object.keys(modelProviders).length} endpoints)`,
							)
							memoryCache.set(key, modelProviders)
							try {
								await writeModelEndpoints(key, modelProviders)
							} catch (error) {
								console.error(`[endpointCache] Error writing ${key} to file cache`, error)
							}
							return modelProviders
						}
						return {}
					} catch (e) {
						console.error(`[endpointCache] bg_refresh_failed: ${key}`, e)
						throw e
					}
				})()

				const timedBg = withTimeout(bgPromise, 30_000, `getModelEndpoints(background:${key})`)
				inFlightEndpointFetches.set(key, timedBg)
				Promise.resolve(timedBg).finally(() => inFlightEndpointFetches.delete(key))
			}

			return file
		}
	} catch {
		// ignore file read errors; fall through
	}

	// 3) Coalesce concurrent fetches
	const inFlight = inFlightEndpointFetches.get(key)
	if (inFlight) {
		console.log(`[endpointCache] coalesced_wait: ${key}`)
		return inFlight
	}

	// 4) Single network fetch for this key
	const fetchPromise = (async (): Promise<ModelRecord> => {
		let modelProviders: ModelRecord = {}
		try {
			modelProviders = await getOpenRouterModelEndpoints(modelId)

			if (Object.keys(modelProviders).length > 0) {
				console.log(
					`[endpointCache] network_fetch_done: ${key} (${Object.keys(modelProviders).length} endpoints)`,
				)
				// Update memory cache first
				memoryCache.set(key, modelProviders)

				// Best-effort persist
				try {
					await writeModelEndpoints(key, modelProviders)
				} catch (error) {
					console.error(`[endpointCache] Error writing ${key} to file cache`, error)
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
		} catch (error) {
			console.error(`[endpointCache] network_fetch_failed: ${key}`, error)
			throw error
		}
	})()

	const timed = withTimeout(fetchPromise, 30_000, `getModelEndpoints(${key})`)
	inFlightEndpointFetches.set(key, timed)
	try {
		return await timed
	} finally {
		inFlightEndpointFetches.delete(key)
	}
}

export const flushModelProviders = async (router: RouterName, modelId: string) =>
	memoryCache.del(getCacheKey(router, modelId))
