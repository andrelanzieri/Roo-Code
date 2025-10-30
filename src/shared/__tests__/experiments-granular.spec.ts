import { describe, it, expect } from "vitest"
import type { Experiments, ReReadAfterEditGranular } from "@roo-code/types"
import { experiments } from "../experiments"

describe("granular re-read after edit experiment", () => {
	describe("isReReadAfterEditEnabled", () => {
		it("should return true when legacy reReadAfterEdit is enabled", () => {
			const config: Experiments = {
				reReadAfterEdit: true,
			}

			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(true)
		})

		it("should return false when legacy reReadAfterEdit is disabled and no granular settings", () => {
			const config: Experiments = {
				reReadAfterEdit: false,
			}

			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(false)
		})

		it("should return true for specific edit types when granular settings are enabled", () => {
			const config: Experiments = {
				reReadAfterEdit: false,
				reReadAfterEditGranular: {
					applyDiff: true,
					multiApplyDiff: false,
					writeToFile: true,
					insertContent: false,
					searchAndReplace: true,
				},
			}

			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(true)
		})

		it("should prioritize legacy setting over granular when both are present", () => {
			const config: Experiments = {
				reReadAfterEdit: true, // Legacy enabled
				reReadAfterEditGranular: {
					applyDiff: false, // Granular disabled
					multiApplyDiff: false,
					writeToFile: false,
					insertContent: false,
					searchAndReplace: false,
				},
			}

			// Legacy setting should override granular settings
			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(true)
		})

		it("should handle partial granular settings", () => {
			const config: Experiments = {
				reReadAfterEdit: false,
				reReadAfterEditGranular: {
					applyDiff: true,
					// Other fields undefined
				} as ReReadAfterEditGranular,
			}

			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(true)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(false)
		})

		it("should return false when no experiments config is provided", () => {
			const config: Experiments = {}

			expect(experiments.isReReadAfterEditEnabled(config, "applyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "multiApplyDiff")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "writeToFile")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "insertContent")).toBe(false)
			expect(experiments.isReReadAfterEditEnabled(config, "searchAndReplace")).toBe(false)
		})
	})
})
