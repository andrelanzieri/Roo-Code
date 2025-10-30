import type {
	AssertEqual,
	Equals,
	Keys,
	Values,
	ExperimentId,
	Experiments,
	ReReadAfterEditGranular,
} from "@roo-code/types"

export const EXPERIMENT_IDS = {
	MULTI_FILE_APPLY_DIFF: "multiFileApplyDiff",
	POWER_STEERING: "powerSteering",
	PREVENT_FOCUS_DISRUPTION: "preventFocusDisruption",
	IMAGE_GENERATION: "imageGeneration",
	RUN_SLASH_COMMAND: "runSlashCommand",
	RE_READ_AFTER_EDIT: "reReadAfterEdit",
	RE_READ_AFTER_EDIT_GRANULAR: "reReadAfterEditGranular",
} as const satisfies Record<string, ExperimentId>

type _AssertExperimentIds = AssertEqual<Equals<ExperimentId, Values<typeof EXPERIMENT_IDS>>>

type ExperimentKey = Keys<typeof EXPERIMENT_IDS>

interface ExperimentConfig {
	enabled: boolean | ReReadAfterEditGranular
}

export const experimentConfigsMap: Record<ExperimentKey, ExperimentConfig> = {
	MULTI_FILE_APPLY_DIFF: { enabled: false },
	POWER_STEERING: { enabled: false },
	PREVENT_FOCUS_DISRUPTION: { enabled: false },
	IMAGE_GENERATION: { enabled: false },
	RUN_SLASH_COMMAND: { enabled: false },
	RE_READ_AFTER_EDIT: { enabled: false },
	RE_READ_AFTER_EDIT_GRANULAR: {
		enabled: {
			applyDiff: false,
			multiApplyDiff: false,
			writeToFile: false,
			insertContent: false,
			searchAndReplace: false,
		},
	},
}

export const experimentDefault = Object.fromEntries(
	Object.entries(experimentConfigsMap).map(([_, config]) => [
		EXPERIMENT_IDS[_ as keyof typeof EXPERIMENT_IDS] as ExperimentId,
		config.enabled,
	]),
) as Experiments

export const experiments = {
	get: (id: ExperimentKey): ExperimentConfig | undefined => experimentConfigsMap[id],
	isEnabled: (experimentsConfig: Experiments, id: ExperimentId) => experimentsConfig[id] ?? experimentDefault[id],
	isReReadAfterEditEnabled: (experimentsConfig: Experiments, editType: keyof ReReadAfterEditGranular): boolean => {
		// If the legacy RE_READ_AFTER_EDIT is enabled, it applies to all edit types
		if (experimentsConfig.reReadAfterEdit) {
			return true
		}

		// Check if granular settings are enabled and if the specific edit type is enabled
		const granularSettings = experimentsConfig.reReadAfterEditGranular
		if (granularSettings && granularSettings[editType]) {
			return true
		}

		return false
	},
} as const
