import { z } from "zod"

export default {
	description: "Simple tool",
	parameters: z.object({ value: z.string() }),
	async execute(args: { value: string }) {
		return "Result: " + args.value
	},
}
