import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"
import { watsonxAiDefaultModelId, watsonxAiModels } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"

import { inputEventTransform } from "../transforms"

type WatsonxAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(field: K, value: ProviderSettings[K]) => void
}

export const WatsonxAI = ({ apiConfiguration, setApiConfigurationField }: WatsonxAIProps) => {
	const { t } = useAppTranslation()

	const handleInputChange = useCallback(
		<E,>(field: keyof ProviderSettings, transform: (event: E) => any = inputEventTransform) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const defaultModel = watsonxAiDefaultModelId
	const modelInfo = watsonxAiModels[defaultModel] || {}
	const defaultModelDescription =
		typeof modelInfo === "object" && "contextWindow" in modelInfo
			? `Context window: ${modelInfo.contextWindow} tokens`
			: "IBM watsonx model"

	return (
		<>
			<VSCodeTextField
				value={apiConfiguration?.watsonxApiKey || ""}
				type="password"
				onInput={handleInputChange("watsonxApiKey")}
				placeholder={t("settings:placeholders.apiKey")}
				className="w-full">
				<label className="block font-medium mb-1">IBM watsonx API Key</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground -mt-2">
				{t("settings:providers.apiKeyStorageNotice")}
			</div>
			{!apiConfiguration?.watsonxApiKey && (
				<VSCodeButtonLink href="https://cloud.ibm.com/iam/apikeys" appearance="secondary">
					Get WatsonX API Key
				</VSCodeButtonLink>
			)}

			<VSCodeTextField
				value={apiConfiguration?.watsonxProjectId || ""}
				onInput={handleInputChange("watsonxProjectId")}
				placeholder="Project ID"
				className="w-full mt-4">
				<label className="block font-medium mb-1">IBM watsonx Project ID</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground mt-1">
				Project ID is required for IBM watsonx integration
			</div>

			<VSCodeTextField
				value={apiConfiguration?.watsonxBaseUrl || ""}
				onInput={handleInputChange("watsonxBaseUrl")}
				placeholder="https://us-south.ml.cloud.ibm.com"
				className="w-full mt-4">
				<label className="block font-medium mb-1">IBM watsonx API Base URL (Optional)</label>
			</VSCodeTextField>
			<div className="text-sm text-vscode-descriptionForeground mt-1 mb-3">
				Default: https://us-south.ml.cloud.ibm.com
				<h3 className="font-large">Default Model Information</h3>
				<div className="text-sm">
					<div>
						<strong>Model ID:</strong> {defaultModel}
					</div>
					<div>
						<strong>Description:</strong> {defaultModelDescription}
					</div>
				</div>
			</div>
		</>
	)
}
