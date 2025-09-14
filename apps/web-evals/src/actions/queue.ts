"use server"

import fs from "fs"
import { spawn } from "child_process"
import { revalidatePath } from "next/cache"

import { deleteRun as _deleteRun } from "@roo-code/evals"

import { redisClient } from "@/lib/server/redis"

const RUN_QUEUE_KEY = "evals:run-queue"
const ACTIVE_RUN_KEY = "evals:active-run"
const DISPATCH_LOCK_KEY = "evals:dispatcher:lock"
const ACTIVE_RUN_TTL_SECONDS = 60 * 60 * 12 // 12 hours
const DISPATCH_LOCK_TTL_SECONDS = 30

async function spawnController(runId: number) {
	const isRunningInDocker = fs.existsSync("/.dockerenv")

	const dockerArgs = [
		`--name evals-controller-${runId}`,
		"--rm",
		"--network evals_default",
		"-v /var/run/docker.sock:/var/run/docker.sock",
		"-v /tmp/evals:/var/log/evals",
		"-e HOST_EXECUTION_METHOD=docker",
	]

	const cliCommand = `pnpm --filter @roo-code/evals cli --runId ${runId}`

	const command = isRunningInDocker
		? `docker run ${dockerArgs.join(" ")} evals-runner sh -c "${cliCommand}"`
		: cliCommand

	const childProcess = spawn("sh", ["-c", command], {
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	})

	// Best-effort logging of controller output
	try {
		const logStream = fs.createWriteStream("/tmp/roo-code-evals.log", { flags: "a" })
		childProcess.stdout?.pipe(logStream)
		childProcess.stderr?.pipe(logStream)
	} catch (_error) {
		// Intentionally ignore logging pipe errors
	}

	childProcess.unref()
}

/**
 * Enqueue a run into the global FIFO (idempotent).
 */
export async function enqueueRun(runId: number) {
	const redis = await redisClient()
	const exists = await redis.lPos(RUN_QUEUE_KEY, runId.toString())
	if (exists === null) {
		await redis.rPush(RUN_QUEUE_KEY, runId.toString())
	}
	revalidatePath("/runs")
}

/**
 * Dispatcher: if no active run, pop next from queue and start controller.
 * Uses a short-lived lock to avoid races between concurrent dispatchers.
 */
export async function dispatchNextRun() {
	const redis = await redisClient()

	// Try to acquire dispatcher lock
	const locked = await redis.set(DISPATCH_LOCK_KEY, "1", { NX: true, EX: DISPATCH_LOCK_TTL_SECONDS })
	if (!locked) return

	try {
		// If an active run is present, nothing to do.
		const active = await redis.get(ACTIVE_RUN_KEY)
		if (active) return

		const nextId = await redis.lPop(RUN_QUEUE_KEY)
		if (!nextId) return

		const ok = await redis.set(ACTIVE_RUN_KEY, nextId, { NX: true, EX: ACTIVE_RUN_TTL_SECONDS })
		if (!ok) {
			// put it back to preserve order and exit
			await redis.lPush(RUN_QUEUE_KEY, nextId)
			return
		}

		await spawnController(Number(nextId))
	} finally {
		await redis.del(DISPATCH_LOCK_KEY).catch(() => {})
	}
}

/**
 * Return 1-based position in the global FIFO queue, or null if not queued.
 */
export async function getQueuePosition(runId: number): Promise<number | null> {
	const redis = await redisClient()
	const idx = await redis.lPos(RUN_QUEUE_KEY, runId.toString())
	return idx === null ? null : idx + 1
}

/**
 * Remove a queued run from the FIFO queue and delete the run record.
 */
export async function cancelQueuedRun(runId: number) {
	const redis = await redisClient()
	await redis.lRem(RUN_QUEUE_KEY, 1, runId.toString())
	await _deleteRun(runId)
	revalidatePath("/runs")
}
