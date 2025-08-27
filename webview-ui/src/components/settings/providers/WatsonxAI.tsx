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

const WATSONX_REGIONS = {
	"us-south": "Dallas (us-south.ml.cloud.ibm.com)",
	"eu-de": "Frankfurt (eu-de.ml.cloud.ibm.com)",
	"eu-gb": "London (eu-gb.ml.cloud.ibm.com)",
	"jp-tok": "Tokyo (jp-tok.ml.cloud.ibm.com)",
	"au-syd": "Sydney (au-syd.ml.cloud.ibm.com)",
	"ca-tor": "Toronto (ca-tor.ml.cloud.ibm.com)",
	"ap-south-1": "Mumbai (ap-south-1.aws.wxai.ibm.com)",
}

const REGION_TO_URL = {
	"us-south": "https://us-south.ml.cloud.ibm.com",
	"eu-de": "https://eu-de.ml.cloud.ibm.com",
	"eu-gb": "https://eu-gb.ml.cloud.ibm.com",
	"jp-tok": "https://jp-tok.ml.cloud.ibm.com",
	"au-syd": "https://au-syd.ml.cloud.ibm.com",
	"ca-tor": "https://ca-tor.ml.cloud.ibm.com",
	"ap-south-1": "https://ap-south-1.aws.wxai.ibm.com",
	custom: "",
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

	useEffect(() => {
		if (!apiConfiguration.watsonxPlatform) {
			setApiConfigurationField("watsonxPlatform", "ibmCloud")
		}
	}, [apiConfiguration.watsonxPlatform, setApiConfigurationField])

	const getCurrentRegion = () => {
		const baseUrl = apiConfiguration?.watsonxBaseUrl || ""
		const regionEntry = Object.entries(REGION_TO_URL).find(([_, url]) => url === baseUrl)
		return regionEntry ? regionEntry[0] : "us-south"
	}

	const [selectedRegion, setSelectedRegion] = useState(getCurrentRegion())

	const handleRegionSelect = useCallback(
		(region: string) => {
			setSelectedRegion(region)
			const baseUrl = REGION_TO_URL[region as keyof typeof REGION_TO_URL] || ""
			setApiConfigurationField("watsonxBaseUrl", baseUrl)
			setApiConfigurationField("watsonxRegion", region)
		},
		[setApiConfigurationField],
	)

	const handlePlatformChange = useCallback(
		(newPlatform: "ibmCloud" | "cloudPak") => {
			setApiConfigurationField("watsonxPlatform", newPlatform)

			if (newPlatform === "ibmCloud") {
				const defaultRegion = "us-south"
				setSelectedRegion(defaultRegion)
				setApiConfigurationField("watsonxRegion", defaultRegion)
				setApiConfigurationField("watsonxBaseUrl", REGION_TO_URL[defaultRegion])
				setApiConfigurationField("watsonxUsername", "")
				setApiConfigurationField("watsonxPassword", "")
				setApiConfigurationField("watsonxAuthType", "apiKey")
			} else {
				setSelectedRegion("custom")
				setApiConfigurationField("watsonxBaseUrl", "")
				setApiConfigurationField("watsonxAuthType", "apiKey")
				setApiConfigurationField("watsonxRegion", "")
			}
		},
		[setApiConfigurationField],
	)

	const handleAuthTypeChange = useCallback(
		(newAuthType: "apiKey" | "password") => {
			setApiConfigurationField("watsonxAuthType", newAuthType)
			if (newAuthType === "apiKey") {
				setApiConfigurationField("watsonxPassword", "")
			} else {
				setApiConfigurationField("watsonxApiKey", "")
			}
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
		const platform = apiConfiguration.watsonxPlatform
		const customUrl = apiConfiguration.watsonxBaseUrl || ""
		const username = apiConfiguration.watsonxUsername
		const authType = apiConfiguration.watsonxAuthType
		const password = apiConfiguration.watsonxPassword

		let baseUrl = ""
		if (platform === "ibmCloud") {
			baseUrl = REGION_TO_URL[selectedRegion as keyof typeof REGION_TO_URL]
		} else {
			baseUrl = customUrl
			setApiConfigurationField("watsonxBaseUrl", baseUrl)
		}

		if (platform === "ibmCloud" && (!apiKey || !baseUrl)) {
			setRefreshStatus("error")
			setRefreshError(t("settings:providers.refreshModels.missingConfig"))
			return
		}

		if (platform === "cloudPak") {
			if (!baseUrl) {
				setRefreshStatus("error")
				setRefreshError("URL is required for IBM Cloud Pak for Data")
				return
			}

			if (!username) {
				setRefreshStatus("error")
				setRefreshError("Username is required for IBM Cloud Pak for Data")
				return
			}

			if (authType === "apiKey" && !apiKey) {
				setRefreshStatus("error")
				setRefreshError("API Key is required for IBM Cloud Pak for Data")
				return
			}

			if (authType === "password" && !password) {
				setRefreshStatus("error")
				setRefreshError("Password is required for IBM Cloud Pak for Data")
				return
			}
		}

		vscode.postMessage({
			type: "requestRouterModels",
			values: {
				watsonxPlatform: apiConfiguration.watsonxPlatform,
				watsonxBaseUrl: apiConfiguration.watsonxBaseUrl,
				watsonxApiKey: apiConfiguration.watsonxApiKey,
				watsonxProjectId: apiConfiguration.watsonxProjectId,
				watsonxModelId: apiConfiguration.watsonxModelId,
				watsonxUsername: apiConfiguration.watsonxUsername,
				watsonxAuthType: apiConfiguration.watsonxAuthType,
				watsonxPassword: apiConfiguration.watsonxPassword,
				watsonxRegion: apiConfiguration.watsonxRegion,
			},
		})
	}, [apiConfiguration, setRefreshStatus, setRefreshError, t, selectedRegion, setApiConfigurationField])

	return (
		<>
			{/* Platform Selection */}
			<div className="w-full mb-4">
				<label className="block font-medium mb-1">IBM watsonx Platform</label>
				<Select
					value={apiConfiguration.watsonxPlatform}
					onValueChange={(value) => handlePlatformChange(value as "ibmCloud" | "cloudPak")}>
					<SelectTrigger className="w-full">
						<SelectValue placeholder="Select a platform" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="ibmCloud">IBM Cloud</SelectItem>
						<SelectItem value="cloudPak">IBM Cloud Pak for Data</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* IBM Cloud specific fields */}
			{apiConfiguration.watsonxPlatform === "ibmCloud" && (
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
				</>
			)}

			{/* IBM Cloud Pak for Data specific fields */}
			{apiConfiguration.watsonxPlatform === "cloudPak" && (
				<>
					<VSCodeTextField
						value={apiConfiguration.watsonxBaseUrl}
						onInput={handleInputChange("watsonxBaseUrl")}
						placeholder="https://your-cp4d-instance.example.com"
						className="w-full">
						<label className="block font-medium mb-1">IBM Cloud Pak for Data URL</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground -mt-2 mb-4">
						Enter the full URL of your IBM Cloud Pak for Data instance
					</div>

					<VSCodeTextField
						value={apiConfiguration.watsonxUsername}
						onInput={handleInputChange("watsonxUsername")}
						placeholder="Username"
						className="w-full">
						<label className="block font-medium mb-1">Username</label>
					</VSCodeTextField>

					<div className="w-full mt-4">
						<label className="block font-medium mb-1">Authentication Type</label>
						<Select
							value={apiConfiguration.watsonxAuthType}
							onValueChange={(value) => handleAuthTypeChange(value as "apiKey" | "password")}>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Select authentication type" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="apiKey">API Key</SelectItem>
								<SelectItem value="password">Password</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{apiConfiguration.watsonxAuthType === "apiKey" ? (
						<VSCodeTextField
							value={apiConfiguration?.watsonxApiKey || ""}
							type="password"
							onInput={handleInputChange("watsonxApiKey")}
							placeholder="API Key"
							className="w-full mt-4">
							<label className="block font-medium mb-1">API Key</label>
						</VSCodeTextField>
					) : (
						<VSCodeTextField
							value={apiConfiguration.watsonxPassword}
							type="password"
							onInput={handleInputChange("watsonxPassword")}
							placeholder="Password"
							className="w-full mt-4">
							<label className="block font-medium mb-1">Password</label>
						</VSCodeTextField>
					)}
					<div className="text-sm text-vscode-descriptionForeground -mt-2">
						{t("settings:providers.apiKeyStorageNotice")}
					</div>
				</>
			)}

			{/* Common fields for both platforms */}
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

			<Button
				variant="outline"
				onClick={handleRefreshModels}
				disabled={
					refreshStatus === "loading" ||
					(apiConfiguration.watsonxPlatform === "ibmCloud" && !apiConfiguration.watsonxApiKey) ||
					(apiConfiguration.watsonxPlatform === "cloudPak" &&
						(!apiConfiguration.watsonxBaseUrl ||
							!apiConfiguration.watsonxUsername ||
							(apiConfiguration.watsonxAuthType === "apiKey" && !apiConfiguration.watsonxApiKey) ||
							(apiConfiguration.watsonxAuthType === "password" && !apiConfiguration.watsonxPassword)))
				}
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
