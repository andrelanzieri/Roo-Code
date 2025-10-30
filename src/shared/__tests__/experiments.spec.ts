// npx vitest run src/shared/__tests__/experiments.spec.ts

import type { ExperimentId, Experiments as ExperimentsType } from "@roo-code/types"

import { EXPERIMENT_IDS, experimentConfigsMap, experiments as Experiments } from "../experiments"

describe("experiments", () => {
	describe("POWER_STEERING", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.POWER_STEERING).toBe("powerSteering")
			expect(experimentConfigsMap.POWER_STEERING).toMatchObject({
				enabled: false,
			})
		})
	})

	describe("MULTI_FILE_APPLY_DIFF", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF).toBe("multiFileApplyDiff")
			expect(experimentConfigsMap.MULTI_FILE_APPLY_DIFF).toMatchObject({
				enabled: false,
			})
		})
	})

	describe("isEnabled", () => {
		it("returns false when POWER_STEERING experiment is not enabled", () => {
			const experiments: ExperimentsType = {
				powerSteering: false,
				multiFileApplyDiff: false,
				preventFocusDisruption: false,
				imageGeneration: false,
				runSlashCommand: false,
				reReadAfterEdit: false,
				reReadAfterEditGranular: undefined,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.POWER_STEERING)).toBe(false)
		})

		it("returns true when experiment POWER_STEERING is enabled", () => {
			const experiments: ExperimentsType = {
				powerSteering: true,
				multiFileApplyDiff: false,
				preventFocusDisruption: false,
				imageGeneration: false,
				runSlashCommand: false,
				reReadAfterEdit: false,
				reReadAfterEditGranular: undefined,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.POWER_STEERING)).toBe(true)
		})

		it("returns false when experiment is not present", () => {
			const experiments: ExperimentsType = {
				powerSteering: false,
				multiFileApplyDiff: false,
				preventFocusDisruption: false,
				imageGeneration: false,
				runSlashCommand: false,
				reReadAfterEdit: false,
				reReadAfterEditGranular: undefined,
			}
			expect(Experiments.isEnabled(experiments, EXPERIMENT_IDS.POWER_STEERING)).toBe(false)
		})
	})

	describe("RE_READ_AFTER_EDIT_GRANULAR", () => {
		it("is configured correctly", () => {
			expect(EXPERIMENT_IDS.RE_READ_AFTER_EDIT_GRANULAR).toBe("reReadAfterEditGranular")
			expect(experimentConfigsMap.RE_READ_AFTER_EDIT_GRANULAR).toMatchObject({
				enabled: false,
			})
		})
	})
})
