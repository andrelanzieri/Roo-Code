import { z, defineCustomTool } from "@roo-code/types"

export default defineCustomTool({
	name: "simple",
	description: "Simple tool",
	parameters: z.object({ value: z.string().describe("The input value") }),
	async execute(args: { value: string }) {
		return "Result: " + args.value
	},
})
