import { z } from "zod"

export default {
	description: "Cached tool",
	parameters: z.object({}),
	async execute() {
		return "cached"
	},
}
