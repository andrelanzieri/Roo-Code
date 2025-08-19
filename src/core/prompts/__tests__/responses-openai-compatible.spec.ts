import { describe, it, expect } from "vitest"
import { formatResponse } from "../responses"

describe("formatResponse.noToolsUsed", () => {
	it("should return standard message when no apiProvider is specified", () => {
		const result = formatResponse.noToolsUsed()

		expect(result).toContain("[ERROR] You did not use a tool in your previous response!")
		expect(result).toContain("# Reminder: Instructions for Tool Use")
		expect(result).not.toContain("OpenAI Compatible")
	})

	it("should return standard message for non-OpenAI-compatible providers", () => {
		const result = formatResponse.noToolsUsed("anthropic")

		expect(result).toContain("[ERROR] You did not use a tool in your previous response!")
		expect(result).toContain("# Reminder: Instructions for Tool Use")
		expect(result).not.toContain("OpenAI Compatible")
	})

	it("should include OpenAI Compatible specific hints when apiProvider is openai-compatible", () => {
		const result = formatResponse.noToolsUsed("openai-compatible")

		expect(result).toContain("[ERROR] You did not use a tool in your previous response!")
		expect(result).toContain("# Important Note for OpenAI Compatible Models")
		expect(result).toContain("Your model appears to not be using the required XML tool format")
		expect(result).toContain("Use XML tags for ALL tool invocations")
		expect(result).toContain("Place tool uses at the END of your message")
		expect(result).toContain("Use only ONE tool per message")
		expect(result).toContain("Follow the exact XML format shown below")
		expect(result).toContain("# Reminder: Instructions for Tool Use")
	})

	it("should maintain the same structure with Next Steps section", () => {
		const resultStandard = formatResponse.noToolsUsed()
		const resultOpenAI = formatResponse.noToolsUsed("openai-compatible")

		// Both should have the Next Steps section
		expect(resultStandard).toContain("# Next Steps")
		expect(resultOpenAI).toContain("# Next Steps")

		// Both should mention attempt_completion and ask_followup_question
		expect(resultStandard).toContain("attempt_completion")
		expect(resultStandard).toContain("ask_followup_question")
		expect(resultOpenAI).toContain("attempt_completion")
		expect(resultOpenAI).toContain("ask_followup_question")

		// Both should end with the automated message note
		expect(resultStandard).toContain("(This is an automated message, so do not respond to it conversationally.)")
		expect(resultOpenAI).toContain("(This is an automated message, so do not respond to it conversationally.)")
	})
})
