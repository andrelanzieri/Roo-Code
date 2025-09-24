import { memo, useState } from "react"
import { Trans } from "react-i18next"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { ChartColumnIncreasing } from "lucide-react"

import type { TelemetrySetting } from "@roo-code/types"

import { vscode } from "@src/utils/vscode"
import { useAppTranslation } from "@src/i18n/TranslationContext"

const TelemetryBanner = () => {
	const { t } = useAppTranslation()
	const [isDismissed, setIsDismissed] = useState(false)

	const handleClose = () => {
		setIsDismissed(true)
		vscode.postMessage({ type: "telemetrySetting", text: "enabled" satisfies TelemetrySetting })
	}

	const handleOpenSettings = () => {
		window.postMessage({
			type: "action",
			action: "settingsButtonClicked",
			values: { section: "about" },
		})
	}

	if (isDismissed) {
		return null
	}

	return (
		<div className="relative p-4 mb-4 flex gap-2 bg-vscode-button-secondaryBackground/50 border-b border-vscode-panel-border text-sm text-vscode-foreground">
			{/* Close button (X) */}
			<button
				onClick={handleClose}
				className="absolute top-1.5 right-2 bg-transparent border-none text-vscode-foreground cursor-pointer text-2xl p-1 opacity-70 hover:opacity-100 transition-opacity duration-200 leading-none"
				aria-label="Close">
				×
			</button>

			<ChartColumnIncreasing className="inline size-4 mt-0.5 shrink-0" />
			<div className="pr-6 cursor-default">
				<div className="mb-0.5 font-bold">{t("welcome:telemetry.helpImprove")}</div>
				<div>
					<Trans
						i18nKey="welcome:telemetry.helpImproveMessage"
						components={{
							settingsLink: <VSCodeLink href="#" onClick={handleOpenSettings} />,
						}}
					/>
				</div>
			</div>
		</div>
	)
}

export default memo(TelemetryBanner)
