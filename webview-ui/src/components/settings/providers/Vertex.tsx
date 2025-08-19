import { useCallback } from "react"
import { VSCodeLink, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { type ProviderSettings, type ModelInfo, VERTEX_REGIONS } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import { ContextWindow } from "@src/components/common/ContextWindow"

import { inputEventTransform } from "../transforms"

type VertexProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Vertex = ({ apiConfiguration, setApiConfigurationField }: VertexProps) => {
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
			const currentModelInfo = apiConfiguration?.vertexCustomModelInfo
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
			setApiConfigurationField("vertexCustomModelInfo", updatedModelInfo)
		},
		[apiConfiguration?.vertexCustomModelInfo, setApiConfigurationField],
	)

	return (
		<>
			<div className="text-sm text-vscode-descriptionForeground">
				<div>{t("settings:providers.googleCloudSetup.title")}</div>
				<div>
					<VSCodeLink
						href="https://cloud.google.com/vertex-ai/generative-ai/docs/partner-models/use-claude#before_you_begin"
						className="text-sm">
						{t("settings:providers.googleCloudSetup.step1")}
					</VSCodeLink>
				</div>
				<div>
					<VSCodeLink
						href="https://cloud.google.com/docs/authentication/provide-credentials-adc#google-idp"
						className="text-sm">
						{t("settings:providers.googleCloudSetup.step2")}
					</VSCodeLink>
				</div>
				<div>
					<VSCodeLink
						href="https://developers.google.com/workspace/guides/create-credentials?hl=en#service-account"
						className="text-sm">
						{t("settings:providers.googleCloudSetup.step3")}
					</VSCodeLink>
				</div>
			</div>
			<VSCodeTextField
				value={apiConfiguration?.vertexJsonCredentials || ""}
				onInput={handleInputChange("vertexJsonCredentials")}
				placeholder={t("settings:placeholders.credentialsJson")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.googleCloudCredentials")}</label>
			</VSCodeTextField>
			<VSCodeTextField
				value={apiConfiguration?.vertexKeyFile || ""}
				onInput={handleInputChange("vertexKeyFile")}
				placeholder={t("settings:placeholders.keyFilePath")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.googleCloudKeyFile")}</label>
			</VSCodeTextField>
			<VSCodeTextField
				value={apiConfiguration?.vertexProjectId || ""}
				onInput={handleInputChange("vertexProjectId")}
				placeholder={t("settings:placeholders.projectId")}
				className="w-full">
				<label className="block font-medium mb-1">{t("settings:providers.googleCloudProjectId")}</label>
			</VSCodeTextField>
			<div>
				<label className="block font-medium mb-1">{t("settings:providers.googleCloudRegion")}</label>
				<Select
					value={apiConfiguration?.vertexRegion || ""}
					onValueChange={(value) => setApiConfigurationField("vertexRegion", value)}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder={t("settings:common.select")} />
					</SelectTrigger>
					<SelectContent>
						{VERTEX_REGIONS.map(({ value, label }) => (
							<SelectItem key={value} value={value}>
								{label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
			<ContextWindow
				customModelInfo={apiConfiguration?.vertexCustomModelInfo}
				defaultContextWindow={128000}
				onContextWindowChange={handleContextWindowChange}
			/>
		</>
	)
}
