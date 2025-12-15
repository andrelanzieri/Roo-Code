import { z, defineCustomTool } from "@roo-code/types"

export default defineCustomTool({
	name: "legacy",
	description: "Legacy tool using args",
	parameters: z.object({ input: z.string().describe("The input string") }),
	async execute(args: { input: string }) {
		return args.input
	},
})
