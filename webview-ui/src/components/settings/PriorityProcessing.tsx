import React from "react"
import { type ProviderSettings, type ModelInfo } from "@roo-code/types"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Checkbox } from "@src/components/ui"
import { ExclamationTriangleIcon } from "@radix-ui/react-icons"

interface PriorityProcessingProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	modelInfo: ModelInfo | undefined
}

export const PriorityProcessing: React.FC<PriorityProcessingProps> = ({
	apiConfiguration,
	setApiConfigurationField,
	modelInfo,
}) => {
	const { t } = useAppTranslation()

	// Only show for GPT-5 and GPT-5-mini models
	const isGpt5Model =
		modelInfo &&
		(apiConfiguration.apiModelId?.includes("gpt-5") || apiConfiguration.apiModelId?.includes("gpt-5-mini"))

	if (!isGpt5Model) {
		return null
	}

	return (
		<div className="flex flex-col gap-2" data-testid="priority-processing">
			<div className="flex items-center gap-2">
				<Checkbox
					id="priority-processing"
					checked={apiConfiguration.enablePriorityProcessing || false}
					onCheckedChange={(checked) =>
						setApiConfigurationField("enablePriorityProcessing", checked === true)
					}
				/>
				<label
					htmlFor="priority-processing"
					className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
					{t("settings:providers.priorityProcessing.label")}
				</label>
			</div>

			{apiConfiguration.enablePriorityProcessing && (
				<div className="ml-6 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
					<div className="flex items-start gap-2">
						<ExclamationTriangleIcon className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
						<div className="text-sm text-yellow-800 dark:text-yellow-200">
							<p className="font-semibold mb-1">{t("settings:providers.priorityProcessing.warning")}</p>
							<p>{t("settings:providers.priorityProcessing.description")}</p>
							<a
								href="https://platform.openai.com/docs/pricing?latest-pricing=priority"
								target="_blank"
								rel="noopener noreferrer"
								className="inline-block mt-2 text-yellow-700 dark:text-yellow-300 underline hover:no-underline">
								{t("settings:providers.priorityProcessing.viewPricing")}
							</a>
						</div>
					</div>
				</div>
			)}
		</div>
	)
}
