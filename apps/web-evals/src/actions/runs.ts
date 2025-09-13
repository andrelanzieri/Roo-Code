"use server"

import * as path from "path"
import { fileURLToPath } from "url"

import { revalidatePath } from "next/cache"
import pMap from "p-map"

import {
	type ExerciseLanguage,
	exerciseLanguages,
	createRun as _createRun,
	deleteRun as _deleteRun,
	createTask,
	getExercisesForLanguage,
	updateRun as _updateRun,
} from "@roo-code/evals"

import { CreateRun } from "@/lib/schemas"
import { enqueueRun, dequeueRun } from "@/lib/server/queue"
import { startQueueProcessor } from "@/lib/server/queue-processor"

const EVALS_REPO_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../evals")

// Start the queue processor when the server starts
startQueueProcessor().catch(console.error)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createRun({ suite, exercises = [], systemPrompt, timeout, ...values }: CreateRun) {
	const run = await _createRun({
		...values,
		timeout,
		socketPath: "", // TODO: Get rid of this.
		status: "queued", // Set initial status to queued
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

	// Add run to queue and get position
	const queuePosition = await enqueueRun(run.id)

	// Update run with queue position
	await _updateRun(run.id, { queuePosition })

	revalidatePath("/runs")

	return { ...run, queuePosition }
}

export async function deleteRun(runId: number) {
	// Try to remove from queue if it's queued
	await dequeueRun(runId)

	await _deleteRun(runId)
	revalidatePath("/runs")
}

export async function cancelRun(runId: number) {
	// Import the cancelQueuedRun function
	const { cancelQueuedRun } = await import("@/lib/server/queue-processor")

	await cancelQueuedRun(runId)
	revalidatePath("/runs")
}
