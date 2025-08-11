import { z } from "zod"

/**
 * HistoryItem
 */

export const historyItemSchema = z.object({
	id: z.string(),
	number: z.number(),
	ts: z.number(),
	task: z.string(),
	tokensIn: z.number(),
	tokensOut: z.number(),
	cacheWrites: z.number().optional(),
	cacheReads: z.number().optional(),
	totalCost: z.number(),
	size: z.number().optional(),
	workspace: z.string().optional(),
	mode: z.string().optional(),
	// Parent-child task relationship fields
	parentTaskId: z.string().optional(),
	childTaskIds: z.array(z.string()).optional(),
	taskStatus: z.enum(["active", "paused", "completed"]).optional(),
})

export type HistoryItem = z.infer<typeof historyItemSchema>
