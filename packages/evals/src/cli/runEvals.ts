import PQueue from "p-queue"
import { spawn } from "child_process"

import { findRun, finishRun, getTasks } from "../db/index.js"
import { EVALS_REPO_PATH } from "../exercises/index.js"

import { Logger, getTag, isDockerContainer, resetEvalsRepo, commitEvalsRepoChanges } from "./utils.js"
import {
	startHeartbeat,
	stopHeartbeat,
	clearActiveRun,
	dequeueRun,
	setActiveRun,
	acquireDispatcherLock,
	releaseDispatcherLock,
} from "./redis.js"
import { processTask, processTaskInContainer } from "./runTask.js"

const dispatchNextRun = async (logger: Logger) => {
	// Try to acquire dispatcher lock
	const lockAcquired = await acquireDispatcherLock(10)

	if (!lockAcquired) {
		logger.info("Dispatcher lock already held, skipping dispatch")
		return
	}

	try {
		// Pop the next run from the queue
		const nextRunId = await dequeueRun()
		if (!nextRunId) {
			logger.info("No runs in queue")
			return
		}

		logger.info(`Dispatching next run: ${nextRunId}`)

		// Set as active run with generous TTL (1 hour)
		const setActive = await setActiveRun(nextRunId, 3600)

		if (!setActive) {
			// This shouldn't happen but handle it gracefully
			logger.error(`Failed to set run ${nextRunId} as active`)
			return
		}

		// Spawn the controller for this run
		const containerized = isDockerContainer()
		const cliCommand = `pnpm --filter @roo-code/evals cli --runId ${nextRunId}`

		if (containerized) {
			// When running in a container, spawn a new container for the next run
			const dockerArgs = [
				`--name evals-controller-${nextRunId}`,
				"--rm",
				"--network evals_default",
				"-v /var/run/docker.sock:/var/run/docker.sock",
				"-v /tmp/evals:/var/log/evals",
				"-e HOST_EXECUTION_METHOD=docker",
			]

			const command = `docker run ${dockerArgs.join(" ")} evals-runner sh -c "${cliCommand}"`
			logger.info(`Spawning next controller: ${command}`)

			const childProcess = spawn("sh", ["-c", command], {
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			})

			childProcess.unref()
		} else {
			// When not in a container, spawn the CLI directly
			logger.info(`Spawning next controller: ${cliCommand}`)

			const childProcess = spawn("sh", ["-c", cliCommand], {
				detached: true,
				stdio: ["ignore", "ignore", "ignore"],
			})

			childProcess.unref()
		}

		logger.info(`Successfully dispatched run ${nextRunId}`)
	} catch (error) {
		logger.error("Error dispatching next run:", error)
	} finally {
		// Release dispatcher lock
		await releaseDispatcherLock()
	}
}

export const runEvals = async (runId: number) => {
	const run = await findRun(runId)

	if (run.taskMetricsId) {
		throw new Error(`Run ${run.id} already finished.`)
	}

	const tasks = await getTasks(runId)

	if (tasks.length === 0) {
		throw new Error(`Run ${run.id} has no tasks.`)
	}

	const containerized = isDockerContainer()

	const logger = new Logger({
		logDir: containerized ? `/var/log/evals/runs/${run.id}` : `/tmp/evals/runs/${run.id}`,
		filename: `controller.log`,
		tag: getTag("runEvals", { run }),
	})

	logger.info(`running ${tasks.length} task(s)`)

	if (!containerized) {
		await resetEvalsRepo({ run, cwd: EVALS_REPO_PATH })
	}

	const heartbeat = await startHeartbeat(run.id)
	const queue = new PQueue({ concurrency: run.concurrency })

	try {
		await queue.addAll(
			tasks
				.filter((task) => task.finishedAt === null)
				.map((task) => async () => {
					try {
						if (containerized) {
							await processTaskInContainer({ taskId: task.id, logger })
						} else {
							await processTask({ taskId: task.id, logger })
						}
					} catch (error) {
						logger.error("error processing task", error)
					}
				}),
		)

		logger.info("finishRun")
		const result = await finishRun(run.id)
		logger.info("result ->", result)

		// There's no need to commit the changes in the container since they
		// will lost when the container is destroyed. I think we should
		// store the diffs in the database instead.
		if (!containerized) {
			await commitEvalsRepoChanges({ run, cwd: EVALS_REPO_PATH })
		}
	} finally {
		logger.info("cleaning up")
		stopHeartbeat(run.id, heartbeat)

		// Clear active run status
		await clearActiveRun()
		logger.info("Cleared active run status")

		// Dispatch the next run in queue
		await dispatchNextRun(logger)

		logger.close()
	}
}
