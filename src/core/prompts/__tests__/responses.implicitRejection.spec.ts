import { describe, it, expect } from "vitest"
import { formatResponse } from "../responses"

describe("formatResponse - Implicit Rejection", () => {
	it("should format implicit rejection message correctly", () => {
		const feedback = "Please add error handling to this code"
		const result = formatResponse.toolImplicitlyRejectedWithFeedback(feedback)

		expect(result).toContain("implicitly rejected")
		expect(result).toContain("NOT applied")
		expect(result).toContain(feedback)
		expect(result).toContain("Do not attempt to revert")
		expect(result).toContain("read the current file content")
		expect(result).toContain("create a new proposal")
	})

	it("should differentiate from explicit rejection message", () => {
		const feedback = "This doesn't look right"
		const implicitResult = formatResponse.toolImplicitlyRejectedWithFeedback(feedback)
		const explicitResult = formatResponse.toolDeniedWithFeedback(feedback)

		expect(implicitResult).not.toBe(explicitResult)
		expect(implicitResult).toContain("implicitly rejected")
		expect(explicitResult).not.toContain("implicitly rejected")
	})

	it("should differentiate from approval with feedback message", () => {
		const feedback = "Looks good, thanks!"
		const implicitResult = formatResponse.toolImplicitlyRejectedWithFeedback(feedback)
		const approvalResult = formatResponse.toolApprovedWithFeedback(feedback)

		expect(implicitResult).not.toBe(approvalResult)
		expect(implicitResult).toContain("rejected")
		expect(approvalResult).toContain("approved")
	})
})
