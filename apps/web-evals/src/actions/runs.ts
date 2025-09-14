"use server"

import * as path from "path"
import fs from "fs"
import { fileURLToPath } from "url"
import { spawn } from "child_process"

import { revalidatePath } from "next/cache"
import pMap from "p-map"

import {
	type ExerciseLanguage,
	exerciseLanguages,
	createRun as _createRun,
	deleteRun as _deleteRun,
	createTask,
	getExercisesForLanguage,
	findRun,
} from "@roo-code/evals"

import { CreateRun } from "@/lib/schemas"
import { redisClient } from "@/lib/server/redis"

const EVALS_REPO_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../evals")

// Queue management keys (matching the ones in packages/evals/src/cli/redis.ts)
const getRunQueueKey = () => `evals:run-queue`
const getActiveRunKey = () => `evals:active-run`
const getDispatcherLockKey = () => `evals:dispatcher:lock`

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

	console.log("spawn ->", command)

	const childProcess = spawn("sh", ["-c", command], {
		detached: true,
		stdio: ["ignore", "pipe", "pipe"],
	})

	const logStream = fs.createWriteStream("/tmp/roo-code-evals.log", { flags: "a" })

	if (childProcess.stdout) {
		childProcess.stdout.pipe(logStream)
	}

	if (childProcess.stderr) {
		childProcess.stderr.pipe(logStream)
	}

	childProcess.unref()
}

export async function dispatchNextRun() {
	const redis = await redisClient()

	// Try to acquire dispatcher lock (10 second TTL)
	const lockAcquired = await redis.set(getDispatcherLockKey(), Date.now().toString(), {
		NX: true,
		EX: 10,
	})

	if (lockAcquired !== "OK") {
		console.log("Dispatcher lock already held, skipping dispatch")
		return
	}

	try {
		// Check if there's already an active run
		const activeRunId = await redis.get(getActiveRunKey())
		if (activeRunId) {
			console.log(`Run ${activeRunId} is already active, skipping dispatch`)
			return
		}

		// Pop the next run from the queue
		const nextRunId = await redis.lPop(getRunQueueKey())
		if (!nextRunId) {
			console.log("No runs in queue")
			return
		}

		const runId = parseInt(nextRunId, 10)
		console.log(`Dispatching run ${runId}`)

		// Set as active run with generous TTL (1 hour default, will be cleared when run completes)
		const setActive = await redis.set(getActiveRunKey(), runId.toString(), {
			NX: true,
			EX: 3600,
		})

		if (setActive !== "OK") {
			// Another process may have set an active run, put this run back in the queue
			console.log("Failed to set active run, requeueing")
			await redis.lPush(getRunQueueKey(), runId.toString())
			return
		}

		// Spawn the controller for this run
		try {
			await spawnController(runId)
			console.log(`Successfully spawned controller for run ${runId}`)
		} catch (error) {
			console.error(`Failed to spawn controller for run ${runId}:`, error)
			// Clear active run and requeue on spawn failure
			await redis.del(getActiveRunKey())
			await redis.lPush(getRunQueueKey(), runId.toString())
		}
	} finally {
		// Release dispatcher lock
		await redis.del(getDispatcherLockKey())
	}
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createRun({ suite, exercises = [], systemPrompt, timeout, ...values }: CreateRun) {
	const run = await _createRun({
		...values,
		timeout,
		socketPath: "", // TODO: Get rid of this.
	})

	if (suite === "partial") {
		for (const path of exercises) {
			const [language, exercise] = path.split("/")

			if (!language || !exercise) {
				throw new Error("Invalid exercise path: " + path)
			}

			await createTask({ ...values, runId: run.id, language: language as ExerciseLanguage, exercise })
		}
	} else {
		for (const language of exerciseLanguages) {
			const exercises = await getExercisesForLanguage(EVALS_REPO_PATH, language)

			await pMap(exercises, (exercise) => createTask({ runId: run.id, language, exercise }), {
				concurrency: 10,
			})
		}
	}

	revalidatePath("/runs")

	// Add run to queue
	const redis = await redisClient()
	await redis.rPush(getRunQueueKey(), run.id.toString())
	console.log(`Run ${run.id} added to queue`)

	// Try to dispatch if no active run
	try {
		await dispatchNextRun()
	} catch (error) {
		console.error("Error dispatching run:", error)
	}

	return run
}

export async function deleteRun(runId: number) {
	await _deleteRun(runId)
	revalidatePath("/runs")
}

export async function cancelQueuedRun(runId: number) {
	const redis = await redisClient()

	// Remove from queue
	const removed = await redis.lRem(getRunQueueKey(), 1, runId.toString())

	if (removed > 0) {
		console.log(`Removed run ${runId} from queue`)
		// Delete the run from database
		await deleteRun(runId)
		return true
	}

	return false
}

export async function getRunQueueStatus(runId: number) {
	const redis = await redisClient()

	// Check if run is active
	const activeRunId = await redis.get(getActiveRunKey())
	if (activeRunId === runId.toString()) {
		return { status: "running" as const, position: null }
	}

	// Check position in queue
	const queue = await redis.lRange(getRunQueueKey(), 0, -1)
	const position = queue.indexOf(runId.toString())

	if (position !== -1) {
		return { status: "queued" as const, position: position + 1 }
	}

	// Check if run has a heartbeat (running but not marked as active - edge case)
	const heartbeat = await redis.get(`heartbeat:${runId}`)
	if (heartbeat) {
		return { status: "running" as const, position: null }
	}

	// Run is completed or not found
	const run = await findRun(runId)
	if (run?.taskMetricsId) {
		return { status: "completed" as const, position: null }
	}

	return { status: "unknown" as const, position: null }
}
