import { useCallback, useState } from "react"
import { Checkbox } from "vscrui"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { VSCodeButtonLink } from "@src/components/common/VSCodeButtonLink"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"

import { inputEventTransform } from "../transforms"

type AzureProps = {
\tapiConfiguration: ProviderSettings
\tsetApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const Azure = ({ apiConfiguration, setApiConfigurationField }: AzureProps) => {
\tconst { t } = useAppTranslation()
\tconst selectedModel = useSelectedModel(apiConfiguration)

\tconst [showAdvanced, setShowAdvanced] = useState(
\t\t!!(apiConfiguration?.azureDeploymentName || apiConfiguration?.azureApiVersion),
\t)

\tconst handleInputChange = useCallback(
\t\t<K extends keyof ProviderSettings, E>(
\t\t\tfield: K,
\t\t\ttransform: (event: E) => ProviderSettings[K] = inputEventTransform,
\t\t) =>
\t\t\t(event: E | Event) => {
\t\t\t\tsetApiConfigurationField(field, transform(event as E))
\t\t\t},
\t\t[setApiConfigurationField],
\t)

\treturn (
\t\t<>
\t\t\t<VSCodeTextField
\t\t\t\tvalue={apiConfiguration?.azureApiKey || apiConfiguration?.apiKey || ""}
\t\t\t\ttype="password"
\t\t\t\tonInput={handleInputChange("azureApiKey")}
\t\t\t\tplaceholder={t("settings:placeholders.apiKey")}
\t\t\t\tclassName="w-full">
\t\t\t\t<label className="block font-medium mb-1">{t("settings:providers.azureApiKey")}</label>
\t\t\t</VSCodeTextField>
\t\t\t<div className="text-sm text-vscode-descriptionForeground -mt-2">
\t\t\t\t{t("settings:providers.apiKeyStorageNotice")}
\t\t\t</div>
\t\t\t{!apiConfiguration?.azureApiKey && !apiConfiguration?.apiKey && (
\t\t\t\t<VSCodeButtonLink href="https://portal.azure.com https://ai.azure.com" appearance="secondary">
\t\t\t\t\t{t("settings:providers.getAzureApiKey")}
\t\t\t\t</VSCodeButtonLink>
\t\t\t)}

\t\t\t<VSCodeTextField
\t\t\t\tvalue={apiConfiguration?.azureBaseUrl || ""}
\t\t\t\ttype="url"
\t\t\t\tonInput={handleInputChange("azureBaseUrl")}
\t\t\t\tplaceholder="https://your-endpoint.cognitiveservices.azure.com/"
\t\t\t\tclassName="w-full">
\t\t\t\t<label className="block font-medium mb-1">{t("settings:providers.azureBaseUrl")}</label>
\t\t\t</VSCodeTextField>
\t\t\t<div className="text-sm text-vscode-descriptionForeground -mt-2">
\t\t\t\t{t("settings:providers.azureBaseUrlHint")}
\t\t\t</div>

\t\t\t<div>
\t\t\t\t<Checkbox
\t\t\t\t\tchecked={showAdvanced}
\t\t\t\t\tonChange={(checked: boolean) => {
\t\t\t\t\t\tsetShowAdvanced(checked)
\t\t\t\t\t\tif (!checked) {
\t\t\t\t\t\t\tsetApiConfigurationField("azureDeploymentName", "")
\t\t\t\t\t\t\tsetApiConfigurationField("azureApiVersion", "")
\t\t\t\t\t\t}
\t\t\t\t\t}}>
\t\t\t\t\t{t("settings:providers.azureShowAdvanced")}
\t\t\t\t</Checkbox>
\t\t\t\t{showAdvanced && (
\t\t\t\t\t<>
\t\t\t\t\t\t<VSCodeTextField
\t\t\t\t\t\t\tvalue={apiConfiguration?.azureDeploymentName || ""}
\t\t\t\t\t\t\ttype="text"
\t\t\t\t\t\t\tonInput={handleInputChange("azureDeploymentName")}
\t\t\t\t\t\t\tplaceholder={selectedModel?.id || "claude-sonnet-4-5"}
\t\t\t\t\t\t\tclassName="w-full mt-2">
\t\t\t\t\t\t\t<label className="block font-medium mb-1">{t("settings:providers.azureDeploymentName")}</label>
\t\t\t\t\t\t</VSCodeTextField>
\t\t\t\t\t\t<div className="text-sm text-vscode-descriptionForeground -mt-2">
\t\t\t\t\t\t\t{t("settings:providers.azureDeploymentNameHint")}
\t\t\t\t\t\t</div>

\t\t\t\t\t\t<VSCodeTextField
\t\t\t\t\t\t\tvalue={apiConfiguration?.azureApiVersion || ""}
\t\t\t\t\t\t\ttype="text"
\t\t\t\t\t\t\tonInput={handleInputChange("azureApiVersion")}
\t\t\t\t\t\t\tplaceholder="2024-12-01-preview"
\t\t\t\t\t\t\tclassName="w-full mt-2">
\t\t\t\t\t\t\t<label className="block font-medium mb-1">{t("settings:providers.azureApiVersion")}</label>
\t\t\t\t\t\t</VSCodeTextField>
\t\t\t\t\t\t<div className="text-sm text-vscode-descriptionForeground -mt-2">
\t\t\t\t\t\t\t{t("settings:providers.azureApiVersionHint")}
\t\t\t\t\t\t</div>
\t\t\t\t\t</>
\t\t\t\t)}
\t\t\t</div>
\t\t</>
\t)
}
