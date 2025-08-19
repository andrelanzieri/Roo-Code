import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings, ModelInfo } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { ContextWindow } from "@src/components/common/ContextWindow"

import { inputEventTransform } from "../transforms"

type GroqProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Groq = ({ apiConfiguration, setApiConfigurationField }: GroqProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<K extends keyof ProviderSettings, E>(
			field: K,
			transform: (event: E) => ProviderSettings[K] = inputEventTransform,
		) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleContextWindowChange = useCallback(
		(contextWindow: number | undefined) => {
			const currentModelInfo = apiConfiguration?.groqCustomModelInfo
			const updatedModelInfo: ModelInfo | undefined = contextWindow
				? {
						maxTokens: currentModelInfo?.maxTokens ?? null,
						contextWindow,
						supportsPromptCache: currentModelInfo?.supportsPromptCache ?? false,
						// Preserve other fields if they exist
						...(currentModelInfo && {
							maxThinkingTokens: currentModelInfo.maxThinkingTokens,
							supportsImages: currentModelInfo.supportsImages,
							supportsComputerUse: currentModelInfo.supportsComputerUse,
							supportsVerbosity: currentModelInfo.supportsVerbosity,
							supportsReasoningBudget: currentModelInfo.supportsReasoningBudget,
							requiredReasoningBudget: currentModelInfo.requiredReasoningBudget,
							supportsReasoningEffort: currentModelInfo.supportsReasoningEffort,
							supportedParameters: currentModelInfo.supportedParameters,
							inputPrice: currentModelInfo.inputPrice,
							outputPrice: currentModelInfo.outputPrice,
							cacheWritesPrice: currentModelInfo.cacheWritesPrice,
							cacheReadsPrice: currentModelInfo.cacheReadsPrice,
							description: currentModelInfo.description,
							reasoningEffort: currentModelInfo.reasoningEffort,
							minTokensPerCachePoint: currentModelInfo.minTokensPerCachePoint,
							maxCachePoints: currentModelInfo.maxCachePoints,
							cachableFields: currentModelInfo.cachableFields,
							tiers: currentModelInfo.tiers,
						}),
					}
				: undefined
			setApiConfigurationField("groqCustomModelInfo", updatedModelInfo)
		},
		[apiConfiguration?.groqCustomModelInfo, setApiConfigurationField],
	)

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.groqApiKey || ""}
				type="password"
				onInput={handleInputChange("groqApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.groqApiKey")}</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.groqApiKey && (
				<VSCodeButtonLink href="https://console.groq.com/keys" appearance="secondary">
					{t("settings:providers.getGroqApiKey")}
				</VSCodeButtonLink>
			)}
			<ContextWindow
				customModelInfo={apiConfiguration?.groqCustomModelInfo}
				defaultContextWindow={128000}
				onContextWindowChange={handleContextWindowChange}
			/>
		</>
	)
}
