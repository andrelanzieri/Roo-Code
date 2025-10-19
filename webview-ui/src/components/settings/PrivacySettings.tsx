import { HTMLAttributes } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Shield } from "lucide-react"
import { telemetryClient } from "@/utils/TelemetryClient"
import type { ProviderSettings } from "@roo-code/types"

import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

interface PrivacySettingsProps extends HTMLAttributes<HTMLDivElement> {
	includeCurrentTime: boolean
	includeTimezone: boolean
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
}

export const PrivacySettings = ({
	includeCurrentTime,
	includeTimezone,
	setApiConfigurationField,
	...props
}: PrivacySettingsProps) => {
	const { t } = useAppTranslation()

	const handleIncludeCurrentTimeChange = (value: boolean) => {
		setApiConfigurationField("includeCurrentTime", value)

		// If disabling current time, also disable timezone
		if (!value) {
			setApiConfigurationField("includeTimezone", false)
		}

		// Track telemetry event
		telemetryClient.capture("privacy_settings_include_time_changed", {
			enabled: value,
		})
	}

	const handleIncludeTimezoneChange = (value: boolean) => {
		setApiConfigurationField("includeTimezone", value)

		// Track telemetry event
		telemetryClient.capture("privacy_settings_include_timezone_changed", {
			enabled: value,
		})
	}

	return (
		<div {...props}>
			<SectionHeader>
				<div className="flex items-center gap-2">
					<Shield className="w-4" />
					<div>{t("settings:sections.privacy")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-6">
					{/* Include Current Time Setting */}
					<div className="flex flex-col gap-1">
						<VSCodeCheckbox
							checked={includeCurrentTime}
							onChange={(e: any) => handleIncludeCurrentTimeChange(e.target.checked)}
							data-testid="include-current-time-checkbox">
							<span className="font-medium">{t("settings:privacy.includeCurrentTime.label")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
							{t("settings:privacy.includeCurrentTime.description")}
						</div>
					</div>

					{/* Include Timezone Setting */}
					<div className="flex flex-col gap-1">
						<VSCodeCheckbox
							checked={includeTimezone}
							disabled={!includeCurrentTime}
							onChange={(e: any) => handleIncludeTimezoneChange(e.target.checked)}
							data-testid="include-timezone-checkbox">
							<span className="font-medium">{t("settings:privacy.includeTimezone.label")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1">
							{t("settings:privacy.includeTimezone.description")}
						</div>
						{!includeCurrentTime && (
							<div className="text-vscode-descriptionForeground text-sm ml-5 mt-1 italic">
								{t("settings:privacy.includeTimezone.disabled")}
							</div>
						)}
					</div>
				</div>
			</Section>
		</div>
	)
}
