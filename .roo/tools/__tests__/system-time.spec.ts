import type { CustomToolContext } from "@roo-code/types"

import systemTime from "../system-time.js"

const mockContext: CustomToolContext = {
	sessionID: "test-session",
	messageID: "test-message",
	agent: "test-agent",
}

describe("system-time tool", () => {
	describe("definition", () => {
		it("should have a description", () => {
			expect(systemTime.description).toBe(
				"Returns the current system date and time in a friendly, human-readable format.",
			)
		})

		it("should have optional timezone parameter", () => {
			expect(systemTime.parameters).toBeDefined()
			const shape = systemTime.parameters!.shape
			expect(shape.timezone).toBeDefined()
			expect(shape.timezone.isOptional()).toBe(true)
		})
	})

	describe("execute", () => {
		it("should return a formatted date/time string", async () => {
			const result = await systemTime.execute({}, mockContext)

			expect(result).toMatch(/^The current date and time is:/)
			// Should include weekday
			expect(result).toMatch(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/)
			// Should include month
			expect(result).toMatch(
				/(January|February|March|April|May|June|July|August|September|October|November|December)/,
			)
			// Should include time format (e.g., "12:30:45")
			expect(result).toMatch(/\d{1,2}:\d{2}:\d{2}/)
		})

		it("should use system timezone when no timezone provided", async () => {
			const result = await systemTime.execute({}, mockContext)

			// Should include timezone abbreviation (e.g., PST, EST, UTC, etc.)
			expect(result).toMatch(/[A-Z]{2,5}$/)
		})

		it("should format with specified timezone", async () => {
			const result = await systemTime.execute({ timezone: "UTC" }, mockContext)

			expect(result).toMatch(/^The current date and time is:/)
			// Should include UTC timezone indicator
			expect(result).toMatch(/UTC/)
		})

		it("should work with different timezone formats", async () => {
			const result = await systemTime.execute({ timezone: "America/New_York" }, mockContext)

			expect(result).toMatch(/^The current date and time is:/)
			// Should include Eastern timezone indicator (EST or EDT depending on daylight saving)
			expect(result).toMatch(/(EST|EDT)/)
		})

		it("should throw error for invalid timezone", async () => {
			await expect(systemTime.execute({ timezone: "Invalid/Timezone" }, mockContext)).rejects.toThrow()
		})
	})
})
