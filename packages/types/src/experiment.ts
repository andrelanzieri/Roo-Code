import { z } from "zod"

import type { Keys, Equals, AssertEqual } from "./type-fu.js"

/**
 * ExperimentId
 */

export const experimentIds = [
	"powerSteering",
	"multiFileApplyDiff",
	"preventFocusDisruption",
	"imageGeneration",
	"runSlashCommand",
	"reReadAfterEdit",
	"reReadAfterEditGranular",
] as const

export const experimentIdsSchema = z.enum(experimentIds)

export type ExperimentId = z.infer<typeof experimentIdsSchema>

/**
 * Experiments
 */

// Schema for granular re-read after edit settings
export const reReadAfterEditGranularSchema = z.object({
	applyDiff: z.boolean().optional(),
	multiApplyDiff: z.boolean().optional(),
	writeToFile: z.boolean().optional(),
	insertContent: z.boolean().optional(),
	searchAndReplace: z.boolean().optional(),
})

export type ReReadAfterEditGranular = z.infer<typeof reReadAfterEditGranularSchema>

export const experimentsSchema = z.object({
	powerSteering: z.boolean().optional(),
	multiFileApplyDiff: z.boolean().optional(),
	preventFocusDisruption: z.boolean().optional(),
	imageGeneration: z.boolean().optional(),
	runSlashCommand: z.boolean().optional(),
	reReadAfterEdit: z.boolean().optional(),
	reReadAfterEditGranular: reReadAfterEditGranularSchema.optional(),
})

export type Experiments = z.infer<typeof experimentsSchema>

type _AssertExperiments = AssertEqual<Equals<ExperimentId, Keys<Experiments>>>
