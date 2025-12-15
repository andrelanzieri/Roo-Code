import { defineCustomTool, parametersSchema } from "@roo-code/types"

/**
 * A simple custom tool that returns the current date and time in a friendly format.
 *
 * To create your own custom tools:
 * 1. Install @roo-code/types: npm install @roo-code/types
 * 2. Create a .ts file in .roo/tools/
 * 3. Export a default tool definition using defineCustomTool()
 *
 * Note that `parametersSchema` is just an alias for `z` (from zod).
 */
export default defineCustomTool({
	name: "system-time",
	description: "Returns the current system date and time in a friendly, human-readable format.",
	parameters: parametersSchema.object({
		timezone: parametersSchema
			.string()
			.optional()
			.describe("Optional timezone to display the time in (e.g., 'America/New_York', 'Europe/London')"),
	}),
	async execute(args) {
		const options: Intl.DateTimeFormatOptions = {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZoneName: "short",
		}

		if (args.timezone) {
			options.timeZone = args.timezone
		}

		const now = new Date()
		const formatted = now.toLocaleString("en-US", options)

		return `The current date and time is: ${formatted}`
	},
})
