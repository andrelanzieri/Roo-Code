import { describe, it, expect } from "vitest"
import { EXPERIMENT_IDS, experiments, experimentDefault } from "../experiments"

describe("RE_READ_AFTER_EDIT experiment", () => {
	it("should include RE_READ_AFTER_EDIT in EXPERIMENT_IDS", () => {
		expect(EXPERIMENT_IDS.RE_READ_AFTER_EDIT).toBe("reReadAfterEdit")
	})

	it("should have RE_READ_AFTER_EDIT in default configuration", () => {
		expect(experimentDefault.reReadAfterEdit).toBe(false)
	})

	it("should correctly check if RE_READ_AFTER_EDIT is enabled", () => {
		const disabledConfig = { reReadAfterEdit: false }
		expect(experiments.isEnabled(disabledConfig, EXPERIMENT_IDS.RE_READ_AFTER_EDIT)).toBe(false)

		const enabledConfig = { reReadAfterEdit: true }
		expect(experiments.isEnabled(enabledConfig, EXPERIMENT_IDS.RE_READ_AFTER_EDIT)).toBe(true)

		const emptyConfig = {}
		expect(experiments.isEnabled(emptyConfig, EXPERIMENT_IDS.RE_READ_AFTER_EDIT)).toBe(false)
	})
})
