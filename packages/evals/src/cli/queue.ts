import fs from "node:fs"
import { spawn } from "node:child_process"

import { redisClient } from "./redis.js"
import { isDockerContainer } from "./utils.js"

const RUN_QUEUE_KEY = "evals:run-queue"
const ACTIVE_RUN_KEY = "evals:active-run"
const DISPATCH_LOCK_KEY = "evals:dispatcher:lock"
const ACTIVE_RUN_TTL_SECONDS = 60 * 60 * 12 // 12 hours
const DISPATCH_LOCK_TTL_SECONDS = 30

async function spawnController(runId: number) {
	const containerized = isDockerContainer()

	const dockerArgs = [
		`--name evals-controller-${runId}`,
		"--rm",
		"--network evals_default",
		"-v /var/run/docker.sock:/var/run/docker.sock",
		"-v /tmp/evals:/var/log/evals",
		"-e HOST_EXECUTION_METHOD=docker",
	]

	const cliCommand = `pnpm --filter @roo-code/evals cli --runId ${runId}`
	const command = containerized ? `docker run ${dockerArgs.join(" ")} evals-runner sh -c "${cliCommand}"` : cliCommand

	const childProcess = spawn("sh", ["-c", command], {
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	})

	// Best-effort logging of controller output (host path or container path)
	try {
		const logStream = fs.createWriteStream("/tmp/roo-code-evals.log", { flags: "a" })
		childProcess.stdout?.pipe(logStream)
		childProcess.stderr?.pipe(logStream)
	} catch {
		// ignore logging errors
	}

	childProcess.unref()
}

/**
 * Clear the active-run marker (if any) and try to dispatch the next run in FIFO order.
 * Uses a short-lived lock to avoid races with other dispatchers (web app or other controllers).
 */
export async function finishActiveRunAndDispatch() {
	const redis = await redisClient()

	// Clear the active run marker first (if exists). We do not care if it was already expired.
	try {
		await redis.del(ACTIVE_RUN_KEY)
	} catch {
		// ignore
	}

	// Try to acquire dispatcher lock (NX+EX). If we don't get it, another dispatcher will handle it.
	const locked = await redis.set(DISPATCH_LOCK_KEY, "1", { NX: true, EX: DISPATCH_LOCK_TTL_SECONDS })
	if (!locked) return

	try {
		// If another process re-marked active-run meanwhile, bail out.
		const active = await redis.get(ACTIVE_RUN_KEY)
		if (active) return

		// Pop next run id from the head of the queue.
		const nextId = await redis.lPop(RUN_QUEUE_KEY)
		if (!nextId) return

		// Mark as active (with TTL) to provide crash safety.
		const ok = await redis.set(ACTIVE_RUN_KEY, nextId, { NX: true, EX: ACTIVE_RUN_TTL_SECONDS })
		if (!ok) {
			// Could not set active (race). Push id back to the head to preserve order and exit.
			await redis.lPush(RUN_QUEUE_KEY, nextId)
			return
		}

		// Spawn the next controller in background.
		await spawnController(Number(nextId))
	} finally {
		try {
			await redis.del(DISPATCH_LOCK_KEY)
		} catch {
			// ignore
		}
	}
}
