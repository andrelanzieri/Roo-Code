import { useCallback, useState, useEffect, useRef } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import { watsonxAiDefaultModelId, type ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { vscode } from "@src/utils/vscode"
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import { ExtensionMessage } from "@roo/ExtensionMessage"

import { inputEventTransform } from "../transforms"
import { OrganizationAllowList } from "@roo/cloud"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { RouterName } from "@roo/api"
import { ModelPicker } from "../ModelPicker"

// Define the available regions
const WATSONX_REGIONS = {
	"us-south": "Dallas (us-south.ml.cloud.ibm.com)",
	"eu-de": "Frankfurt (eu-de.ml.cloud.ibm.com)",
	"eu-gb": "London (eu-gb.ml.cloud.ibm.com)",
	"jp-tok": "Tokyo (jp-tok.ml.cloud.ibm.com)",
	"au-syd": "Sydney (au-syd.ml.cloud.ibm.com)",
	"ca-tor": "Toronto (ca-tor.ml.cloud.ibm.com)",
	"ap-south-1": "Mumbai (ap-south-1.aws.wxai.ibm.com)",
}

// Map region codes to full URLs
const REGION_TO_URL = {
	"us-south": "https://us-south.ml.cloud.ibm.com",
	"eu-de": "https://eu-de.ml.cloud.ibm.com",
	"eu-gb": "https://eu-gb.ml.cloud.ibm.com",
	"jp-tok": "https://jp-tok.ml.cloud.ibm.com",
	"au-syd": "https://au-syd.ml.cloud.ibm.com",
	"ca-tor": "https://ca-tor.ml.cloud.ibm.com",
	"ap-south-1": "https://ap-south-1.aws.wxai.ibm.com",
	custom: "", // For custom URL input
}

type WatsonxAIProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	organizationAllowList: OrganizationAllowList
	modelValidationError?: string
}

export const WatsonxAI = ({
	apiConfiguration,
	setApiConfigurationField,
	organizationAllowList,
	modelValidationError,
}: WatsonxAIProps) => {
	const { t } = useAppTranslation()
	const { routerModels } = useExtensionState()
	const [refreshStatus, setRefreshStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
	const [refreshError, setRefreshError] = useState<string | undefined>()
	const watsonxErrorJustReceived = useRef(false)

	// Determine the current region based on the base URL
	const getCurrentRegion = () => {
		const baseUrl = apiConfiguration?.watsonxBaseUrl || ""

		// Find the region that matches the current base URL
		const regionEntry = Object.entries(REGION_TO_URL).find(([_, url]) => url === baseUrl)

		// Return the region code or 'us-south' as default if not found
		return regionEntry ? regionEntry[0] : "us-south"
	}

	const [selectedRegion, setSelectedRegion] = useState(getCurrentRegion())

	// Handle region selection
	const handleRegionSelect = useCallback(
		(region: string) => {
			setSelectedRegion(region)

			// Update the base URL in the API configuration
			const baseUrl = REGION_TO_URL[region as keyof typeof REGION_TO_URL] || ""
			setApiConfigurationField("watsonxBaseUrl", baseUrl)
		},
		[setApiConfigurationField],
	)

	useEffect(() => {
		const handleMessage = (event: MessageEvent<ExtensionMessage>) => {
			const message = event.data
			if (message.type === "singleRouterModelFetchResponse" && !message.success) {
				const providerName = message.values?.provider as RouterName
				if (providerName === "watsonx") {
					watsonxErrorJustReceived.current = true
					setRefreshStatus("error")
					setRefreshError(message.error)
				}
			} else if (message.type === "routerModels") {
				// When router models are updated, update the refresh status
				if (refreshStatus === "loading") {
					if (!watsonxErrorJustReceived.current) {
						setRefreshStatus("success")
					}
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => {
			window.removeEventListener("message", handleMessage)
		}
	}, [refreshStatus, refreshError, t])

	const handleInputChange = useCallback(
		<E,>(field: keyof ProviderSettings, transform: (event: E) => any = inputEventTransform) =>
			(event: E | Event) => {
				setApiConfigurationField(field, transform(event as E))
			},
		[setApiConfigurationField],
	)

	const handleRefreshModels = useCallback(() => {
		setRefreshStatus("loading")
		setRefreshError(undefined)

		const apiKey = apiConfiguration.watsonxApiKey
		const projectId = apiConfiguration.watsonxProjectId
		const baseUrl = REGION_TO_URL[selectedRegion as keyof typeof REGION_TO_URL]

		if (!apiKey) {
			setRefreshStatus("error")
			setRefreshError(t("settings:providers.refreshModels.missingConfig"))
			return
		}

		vscode.postMessage({
			type: "requestRouterModels",
			values: {
				watsonxApiKey: apiKey,
				watsonxProjectId: projectId,
				watsonxBaseUrl: baseUrl,
			},
		})
	}, [apiConfiguration, setRefreshStatus, setRefreshError, t, selectedRegion])

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

			<div className="w-full mt-4">
				<label className="block font-medium mb-1">IBM watsonx Region</label>
				<Select value={selectedRegion} onValueChange={handleRegionSelect}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a region" />
					</SelectTrigger>
					<SelectContent>
						{Object.entries(WATSONX_REGIONS).map(([regionCode, regionName]) => (
							<SelectItem key={regionCode} value={regionCode}>
								{regionName}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<div className="text-sm text-vscode-descriptionForeground mt-1">
					Selected endpoint: {REGION_TO_URL[selectedRegion as keyof typeof REGION_TO_URL]}
				</div>
			</div>

			<Button
				variant="outline"
				onClick={handleRefreshModels}
				disabled={refreshStatus === "loading" || !apiConfiguration.watsonxApiKey}
				className="w-full mt-4">
				<div className="flex items-center gap-2">
					{refreshStatus === "loading" ? (
						<span className="codicon codicon-loading codicon-modifier-spin" />
					) : (
						<span className="codicon codicon-refresh" />
					)}
					{t("settings:providers.refreshModels.label") || "Refresh Models"}
				</div>
			</Button>
			{refreshStatus === "loading" && (
				<div className="text-sm text-vscode-descriptionForeground">
					{t("settings:providers.refreshModels.loading") || "Loading models..."}
				</div>
			)}
			{refreshStatus === "success" && (
				<div className="text-sm text-vscode-foreground">
					{t("settings:providers.refreshModels.success") || "Models refreshed successfully"}
				</div>
			)}
			{refreshStatus === "error" && (
				<div className="text-sm text-vscode-errorForeground">
					{refreshError || t("settings:providers.refreshModels.error") || "Failed to refresh models"}
				</div>
			)}

			<ModelPicker
				apiConfiguration={apiConfiguration}
				defaultModelId={watsonxAiDefaultModelId}
				models={routerModels?.watsonx ?? {}}
				modelIdKey="watsonxModelId"
				serviceName="IBM watsonx"
				serviceUrl="https://cloud.ibm.com/apidocs/watsonx-ai#list-foundation-model-specs"
				setApiConfigurationField={setApiConfigurationField}
				organizationAllowList={organizationAllowList}
				errorMessage={modelValidationError}
			/>
		</>
	)
}
