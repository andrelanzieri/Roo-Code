import { z } from "zod"

export const toolA = {
	description: "Tool A",
	parameters: z.object({}),
	async execute() {
		return "A"
	},
}

export const toolB = {
	description: "Tool B",
	parameters: z.object({}),
	async execute() {
		return "B"
	},
}
