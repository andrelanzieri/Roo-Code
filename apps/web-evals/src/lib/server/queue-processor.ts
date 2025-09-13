import { spawn } from "child_process"
import fs from "fs"

import { updateRun, findRun } from "@roo-code/evals"

import {
	getNextRun,
	setActiveRun,
	clearActiveRun,
	acquireQueueLock,
	releaseQueueLock,
	getActiveRun,
	getQueuedRuns,
	dequeueRun,
} from "./queue"

const POLL_INTERVAL = 5000 // 5 seconds

let isProcessing = false

/**
 * Start processing the queue
 */
export async function startQueueProcessor(): Promise<void> {
	if (isProcessing) {
		console.log("Queue processor is already running")
		return
	}

	isProcessing = true
	console.log("Starting queue processor...")

	// Process queue in a loop
	while (isProcessing) {
		try {
			await processNextInQueue()
		} catch (error) {
			console.error("Error processing queue:", error)
		}

		// Wait before checking again
		await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL))
	}
}

/**
 * Stop processing the queue
 */
export function stopQueueProcessor(): void {
	console.log("Stopping queue processor...")
	isProcessing = false
}

/**
 * Process the next run in the queue
 */
async function processNextInQueue(): Promise<void> {
	// Try to acquire lock
	const hasLock = await acquireQueueLock()
	if (!hasLock) {
		// Another processor has the lock
		return
	}

	try {
		// Check if there's already an active run
		const activeRun = await getActiveRun()
		if (activeRun) {
			// Check if the run is still actually running
			const run = await findRun(activeRun)
			if (run.status === "running") {
				// Still running, wait
				return
			} else {
				// Run finished but wasn't cleared, clear it
				await clearActiveRun()
			}
		}

		// Get next run from queue
		const queuedRun = await getNextRun()
		if (!queuedRun) {
			// Queue is empty
			return
		}

		// Update queue positions for remaining runs
		await updateQueuePositions()

		// Start the run
		await startRun(queuedRun.runId)
	} finally {
		await releaseQueueLock()
	}
}

/**
 * Start executing a run
 */
async function startRun(runId: number): Promise<void> {
	console.log(`Starting run ${runId}...`)

	try {
		// Mark run as active
		await setActiveRun(runId)

		// Update run status to running
		await updateRun(runId, {
			status: "running",
			queuePosition: null,
		})

		// Execute the run (similar to existing createRun logic)
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

		// When process exits, update status and clear active run
		childProcess.on("exit", async (code) => {
			console.log(`Run ${runId} exited with code ${code}`)

			try {
				// Update run status
				await updateRun(runId, {
					status: code === 0 ? "completed" : "failed",
				})

				// Clear active run
				await clearActiveRun()
			} catch (error) {
				console.error(`Error updating run ${runId} status:`, error)
			}
		})

		childProcess.unref()
	} catch (error) {
		console.error(`Error starting run ${runId}:`, error)

		// Update status to failed and clear active run
		await updateRun(runId, { status: "failed" })
		await clearActiveRun()

		throw error
	}
}

/**
 * Update queue positions for all queued runs
 */
async function updateQueuePositions(): Promise<void> {
	const queuedRuns = await getQueuedRuns()

	// Update each run's queue position
	for (let i = 0; i < queuedRuns.length; i++) {
		const position = i + 1
		const queuedRun = queuedRuns[i]
		if (queuedRun) {
			await updateRun(queuedRun.runId, { queuePosition: position })
		}
	}
}

/**
 * Cancel a queued run
 */
export async function cancelQueuedRun(runId: number): Promise<boolean> {
	const run = await findRun(runId)

	if (run.status !== "queued") {
		throw new Error(`Run ${runId} is not queued (status: ${run.status})`)
	}

	// Remove from queue
	const removed = await dequeueRun(runId)

	if (removed) {
		// Update run status
		await updateRun(runId, {
			status: "cancelled",
			queuePosition: null,
		})

		// Update positions for remaining queued runs
		await updateQueuePositions()
	}

	return removed
}
