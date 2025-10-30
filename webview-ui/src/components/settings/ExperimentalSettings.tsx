import { HTMLAttributes } from "react"
import { FlaskConical } from "lucide-react"

import type { Experiments, ReReadAfterEditGranular } from "@roo-code/types"

import { EXPERIMENT_IDS, experimentConfigsMap } from "@roo/experiments"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { cn } from "@src/lib/utils"

import { SetExperimentEnabled } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { ExperimentalFeature } from "./ExperimentalFeature"
import { ImageGenerationSettings } from "./ImageGenerationSettings"
import { ReReadAfterEditGranularSettings } from "./ReReadAfterEditGranularSettings"

type ExperimentalSettingsProps = HTMLAttributes<HTMLDivElement> & {
	experiments: Experiments
	setExperimentEnabled: SetExperimentEnabled
	setReReadAfterEditGranular?: (settings: ReReadAfterEditGranular) => void
	apiConfiguration?: any
	setApiConfigurationField?: any
	openRouterImageApiKey?: string
	openRouterImageGenerationSelectedModel?: string
	setOpenRouterImageApiKey?: (apiKey: string) => void
	setImageGenerationSelectedModel?: (model: string) => void
}

export const ExperimentalSettings = ({
	experiments,
	setExperimentEnabled,
	setReReadAfterEditGranular,
	apiConfiguration,
	setApiConfigurationField,
	openRouterImageApiKey,
	openRouterImageGenerationSelectedModel,
	setOpenRouterImageApiKey,
	setImageGenerationSelectedModel,
	className,
	...props
}: ExperimentalSettingsProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<FlaskConical className="w-4" />
					<div>{t("settings:sections.experimental")}</div>
				</div>
			</SectionHeader>

			<Section>
				{Object.entries(experimentConfigsMap)
					.filter(([key]) => key in EXPERIMENT_IDS)
					.map((config) => {
						if (config[0] === "MULTI_FILE_APPLY_DIFF") {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={experiments[EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF] ?? false}
									onChange={(enabled) =>
										setExperimentEnabled(EXPERIMENT_IDS.MULTI_FILE_APPLY_DIFF, enabled)
									}
								/>
							)
						}
						if (
							config[0] === "IMAGE_GENERATION" &&
							setOpenRouterImageApiKey &&
							setImageGenerationSelectedModel
						) {
							return (
								<ImageGenerationSettings
									key={config[0]}
									enabled={experiments[EXPERIMENT_IDS.IMAGE_GENERATION] ?? false}
									onChange={(enabled) =>
										setExperimentEnabled(EXPERIMENT_IDS.IMAGE_GENERATION, enabled)
									}
									openRouterImageApiKey={openRouterImageApiKey}
									openRouterImageGenerationSelectedModel={openRouterImageGenerationSelectedModel}
									setOpenRouterImageApiKey={setOpenRouterImageApiKey}
									setImageGenerationSelectedModel={setImageGenerationSelectedModel}
								/>
							)
						}
						// Show granular settings for RE_READ_AFTER_EDIT
						if (config[0] === "RE_READ_AFTER_EDIT_GRANULAR" && setReReadAfterEditGranular) {
							return (
								<ReReadAfterEditGranularSettings
									key={config[0]}
									enabled={experiments[EXPERIMENT_IDS.RE_READ_AFTER_EDIT] ?? false}
									granularSettings={experiments[EXPERIMENT_IDS.RE_READ_AFTER_EDIT_GRANULAR]}
									onChange={(enabled) =>
										setExperimentEnabled(EXPERIMENT_IDS.RE_READ_AFTER_EDIT, enabled)
									}
									onGranularChange={setReReadAfterEditGranular}
								/>
							)
						}
						// Skip the legacy RE_READ_AFTER_EDIT if granular is available
						if (config[0] === "RE_READ_AFTER_EDIT" && setReReadAfterEditGranular) {
							return null
						}
						const experimentId = EXPERIMENT_IDS[config[0] as keyof typeof EXPERIMENT_IDS]
						const value = experiments[experimentId]
						// Only render if it's a boolean (not granular settings object)
						if (typeof value === "boolean" || value === undefined) {
							return (
								<ExperimentalFeature
									key={config[0]}
									experimentKey={config[0]}
									enabled={value ?? false}
									onChange={(enabled) => setExperimentEnabled(experimentId, enabled)}
								/>
							)
						}
						return null
					})}
			</Section>
		</div>
	)
}
