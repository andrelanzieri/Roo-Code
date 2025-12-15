import { z, defineCustomTool } from "@roo-code/types"

export default defineCustomTool({
	name: "cached",
	description: "Cached tool",
	parameters: z.object({}),
	async execute() {
		return "cached"
	},
})
