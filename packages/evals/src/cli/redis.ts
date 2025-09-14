import { createClient, type RedisClientType } from "redis"

let redis: RedisClientType | undefined

export const redisClient = async () => {
	if (!redis) {
		redis = createClient({ url: process.env.REDIS_URL || "redis://localhost:6379" })
		redis.on("error", (error) => console.error("redis error:", error))
		await redis.connect()
	}

	return redis
}

export const getPubSubKey = (runId: number) => `evals:${runId}`
export const getRunnersKey = (runId: number) => `runners:${runId}`
export const getHeartbeatKey = (runId: number) => `heartbeat:${runId}`

// Queue management keys
export const getRunQueueKey = () => `evals:run-queue`
export const getActiveRunKey = () => `evals:active-run`
export const getDispatcherLockKey = () => `evals:dispatcher:lock`

export const registerRunner = async ({
	runId,
	taskId,
	timeoutSeconds,
}: {
	runId: number
	taskId: number
	timeoutSeconds: number
}) => {
	const redis = await redisClient()
	const runnersKey = getRunnersKey(runId)
	await redis.sAdd(runnersKey, `task-${taskId}:${process.env.HOSTNAME ?? process.pid}`)
	await redis.expire(runnersKey, timeoutSeconds)
}

export const deregisterRunner = async ({ runId, taskId }: { runId: number; taskId: number }) => {
	const redis = await redisClient()
	await redis.sRem(getRunnersKey(runId), `task-${taskId}:${process.env.HOSTNAME ?? process.pid}`)
}

export const startHeartbeat = async (runId: number, seconds: number = 10) => {
	const pid = process.pid.toString()
	const redis = await redisClient()
	const heartbeatKey = getHeartbeatKey(runId)
	await redis.setEx(heartbeatKey, seconds, pid)

	return setInterval(
		() =>
			redis.expire(heartbeatKey, seconds).catch((error) => {
				console.error("heartbeat error:", error)
			}),
		(seconds * 1_000) / 2,
	)
}

export const stopHeartbeat = async (runId: number, heartbeat: NodeJS.Timeout) => {
	clearInterval(heartbeat)

	try {
		const redis = await redisClient()
		await redis.del(getHeartbeatKey(runId))
	} catch (error) {
		console.error("redis.del failed:", error)
	}
}

// Queue management functions
export const enqueueRun = async (runId: number) => {
	const redis = await redisClient()
	await redis.rPush(getRunQueueKey(), runId.toString())
}

export const dequeueRun = async (): Promise<number | null> => {
	const redis = await redisClient()
	const runId = await redis.lPop(getRunQueueKey())
	return runId ? parseInt(runId, 10) : null
}

export const getQueuePosition = async (runId: number): Promise<number | null> => {
	const redis = await redisClient()
	const position = await redis.lPos(getRunQueueKey(), runId.toString())
	return position !== null ? position : null
}

export const removeFromQueue = async (runId: number): Promise<boolean> => {
	const redis = await redisClient()
	const removed = await redis.lRem(getRunQueueKey(), 1, runId.toString())
	return removed > 0
}

export const getActiveRun = async (): Promise<number | null> => {
	const redis = await redisClient()
	const activeRunId = await redis.get(getActiveRunKey())
	return activeRunId ? parseInt(activeRunId, 10) : null
}

export const setActiveRun = async (runId: number, ttlSeconds: number = 3600): Promise<boolean> => {
	const redis = await redisClient()
	// Use SET NX (set if not exists) with EX (expiry) for crash safety
	const result = await redis.set(getActiveRunKey(), runId.toString(), {
		NX: true,
		EX: ttlSeconds,
	})
	return result === "OK"
}

export const clearActiveRun = async (): Promise<void> => {
	const redis = await redisClient()
	await redis.del(getActiveRunKey())
}

export const acquireDispatcherLock = async (ttlSeconds: number = 10): Promise<boolean> => {
	const redis = await redisClient()
	const lockId = Date.now().toString()
	const result = await redis.set(getDispatcherLockKey(), lockId, {
		NX: true,
		EX: ttlSeconds,
	})
	return result === "OK"
}

export const releaseDispatcherLock = async (): Promise<void> => {
	const redis = await redisClient()
	await redis.del(getDispatcherLockKey())
}

export const getQueuedRunIds = async (): Promise<number[]> => {
	const redis = await redisClient()
	const runIds = await redis.lRange(getRunQueueKey(), 0, -1)
	return runIds.map((id) => parseInt(id, 10))
}
