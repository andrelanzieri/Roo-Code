import { parametersSchema, defineCustomTool } from "@roo-code/types"

export default defineCustomTool({
	name: "system_time",
	description: "Returns the current system date and time in a friendly, human-readable format.",
	parameters: parametersSchema.object({
		timezone: parametersSchema
			.string()
			.nullable()
			.describe("Timezone to display the time in (e.g., 'America/New_York', 'Europe/London')"),
	}),
	async execute({ timezone }) {
		const now = new Date()

		const formatted = now.toLocaleString("en-US", {
			weekday: "long",
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			timeZoneName: "short",
			timeZone: timezone ?? undefined,
		})

		return `The current date and time is: ${formatted}`
	},
})
