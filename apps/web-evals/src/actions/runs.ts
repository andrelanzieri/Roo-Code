"use server"

import * as path from "path"
import { fileURLToPath } from "url"

import { enqueueRun, dispatchNextRun } from "@/actions/queue"

import { revalidatePath } from "next/cache"
import pMap from "p-map"

import {
	type ExerciseLanguage,
	exerciseLanguages,
	createRun as _createRun,
	deleteRun as _deleteRun,
	createTask,
	getExercisesForLanguage,
} from "@roo-code/evals"

import { CreateRun } from "@/lib/schemas"

const EVALS_REPO_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../evals")

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

	try {
		// Enqueue the run and attempt to dispatch if no active run exists.
		await enqueueRun(run.id)
		await dispatchNextRun()
	} catch (error) {
		console.error(error)
	}

	return run
}

export async function deleteRun(runId: number) {
	await _deleteRun(runId)
	revalidatePath("/runs")
}
