import { z } from "zod"

export default {
	description: "Legacy tool using args",
	args: z.object({ input: z.string() }),
	async execute(args: { input: string }) {
		return args.input
	},
}
