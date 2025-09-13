import { redisClient } from "./redis"

const QUEUE_KEY = "evals:run:queue"
const ACTIVE_RUN_KEY = "evals:run:active"
const QUEUE_LOCK_KEY = "evals:queue:lock"
const LOCK_TTL = 60 // seconds

export interface QueuedRun {
	runId: number
	addedAt: number
}

/**
 * Add a run to the queue
 */
export async function enqueueRun(runId: number): Promise<number> {
	const redis = await redisClient()
	const queuedRun: QueuedRun = {
		runId,
		addedAt: Date.now(),
	}

	// Add to queue and return position (1-based)
	await redis.rPush(QUEUE_KEY, JSON.stringify(queuedRun))
	const position = await redis.lLen(QUEUE_KEY)

	return position
}

/**
 * Remove a run from the queue (for cancellation)
 */
export async function dequeueRun(runId: number): Promise<boolean> {
	const redis = await redisClient()

	// Get all items in queue
	const items = await redis.lRange(QUEUE_KEY, 0, -1)

	// Find and remove the run
	for (const item of items) {
		const queuedRun: QueuedRun = JSON.parse(item)
		if (queuedRun.runId === runId) {
			await redis.lRem(QUEUE_KEY, 1, item)
			return true
		}
	}

	return false
}

/**
 * Get the next run from the queue
 */
export async function getNextRun(): Promise<QueuedRun | null> {
	const redis = await redisClient()

	// Pop from the front of the queue
	const item = await redis.lPop(QUEUE_KEY)
	if (!item) {
		return null
	}

	return JSON.parse(item) as QueuedRun
}

/**
 * Get current queue position for a run
 */
export async function getQueuePosition(runId: number): Promise<number | null> {
	const redis = await redisClient()

	// Get all items in queue
	const items = await redis.lRange(QUEUE_KEY, 0, -1)

	// Find position (1-based)
	for (let i = 0; i < items.length; i++) {
		const item = items[i]
		if (item) {
			const queuedRun: QueuedRun = JSON.parse(item)
			if (queuedRun.runId === runId) {
				return i + 1
			}
		}
	}

	return null
}

/**
 * Get all queued runs
 */
export async function getQueuedRuns(): Promise<QueuedRun[]> {
	const redis = await redisClient()

	const items = await redis.lRange(QUEUE_KEY, 0, -1)
	return items.map((item) => JSON.parse(item) as QueuedRun)
}

/**
 * Set the active run
 */
export async function setActiveRun(runId: number): Promise<void> {
	const redis = await redisClient()
	await redis.set(ACTIVE_RUN_KEY, runId.toString())
}

/**
 * Get the active run
 */
export async function getActiveRun(): Promise<number | null> {
	const redis = await redisClient()
	const runId = await redis.get(ACTIVE_RUN_KEY)
	return runId ? parseInt(runId, 10) : null
}

/**
 * Clear the active run
 */
export async function clearActiveRun(): Promise<void> {
	const redis = await redisClient()
	await redis.del(ACTIVE_RUN_KEY)
}

/**
 * Try to acquire a lock for queue processing
 */
export async function acquireQueueLock(): Promise<boolean> {
	const redis = await redisClient()

	// Try to set lock with NX (only if not exists) and EX (expiry)
	const result = await redis.set(QUEUE_LOCK_KEY, "1", {
		NX: true,
		EX: LOCK_TTL,
	})

	return result === "OK"
}

/**
 * Release the queue processing lock
 */
export async function releaseQueueLock(): Promise<void> {
	const redis = await redisClient()
	await redis.del(QUEUE_LOCK_KEY)
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
	queueLength: number
	activeRun: number | null
	queuedRuns: QueuedRun[]
}> {
	const redis = await redisClient()

	const [queueLength, activeRun, queuedRuns] = await Promise.all([
		redis.lLen(QUEUE_KEY),
		getActiveRun(),
		getQueuedRuns(),
	])

	return {
		queueLength,
		activeRun,
		queuedRuns,
	}
}
