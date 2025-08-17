import React, { HTMLAttributes } from "react"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { Palette } from "lucide-react"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"

import { SetCachedStateField } from "./types"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"

type UISettingsProps = HTMLAttributes<HTMLDivElement> & {
	// Prompt Input Area settings
	showEnhancePromptButton?: boolean
	showCodebaseIndexingButton?: boolean
	showAddImagesToMessageButton?: boolean
	showManageSlashCommandsButton?: boolean
	showHintText?: boolean
	showSendButton?: boolean
	showApiConfigurationButton?: boolean
	showAutoApproveTab?: boolean
	// General UI settings
	showContextPercentageBar?: boolean
	// Setters
	setCachedStateField: SetCachedStateField<
		| "showEnhancePromptButton"
		| "showCodebaseIndexingButton"
		| "showAddImagesToMessageButton"
		| "showManageSlashCommandsButton"
		| "showHintText"
		| "showSendButton"
		| "showApiConfigurationButton"
		| "showAutoApproveTab"
		| "showContextPercentageBar"
	>
}

export const UISettings = ({
	showEnhancePromptButton = true,
	showCodebaseIndexingButton = true,
	showAddImagesToMessageButton = true,
	showManageSlashCommandsButton = true,
	showHintText = true,
	showSendButton = true,
	showApiConfigurationButton = true,
	showAutoApproveTab = true,
	showContextPercentageBar = true,
	setCachedStateField,
	className,
	...props
}: UISettingsProps) => {
	const { t } = useAppTranslation()

	return (
		<div className={cn("flex flex-col gap-2", className)} {...props}>
			<SectionHeader description={t("settings:uiSettings.description")}>
				<div className="flex items-center gap-2">
					<Palette className="w-4" />
					<div>{t("settings:sections.uiSettings")}</div>
				</div>
			</SectionHeader>

			<Section>
				<div className="space-y-4">
					{/* Prompt Input Area Customization */}
					<div>
						<h4 className="font-medium mb-3">{t("settings:uiSettings.promptInputArea.title")}</h4>
						<div className="space-y-3 pl-4">
							<VSCodeCheckbox
								checked={showEnhancePromptButton}
								onChange={(e: any) => setCachedStateField("showEnhancePromptButton", e.target.checked)}
								data-testid="show-enhance-prompt-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showEnhancePromptButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showCodebaseIndexingButton}
								onChange={(e: any) =>
									setCachedStateField("showCodebaseIndexingButton", e.target.checked)
								}
								data-testid="show-codebase-indexing-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showCodebaseIndexingButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showAddImagesToMessageButton}
								onChange={(e: any) =>
									setCachedStateField("showAddImagesToMessageButton", e.target.checked)
								}
								data-testid="show-add-images-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showAddImagesToMessageButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showManageSlashCommandsButton}
								onChange={(e: any) =>
									setCachedStateField("showManageSlashCommandsButton", e.target.checked)
								}
								data-testid="show-manage-slash-commands-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showManageSlashCommandsButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showHintText}
								onChange={(e: any) => setCachedStateField("showHintText", e.target.checked)}
								data-testid="show-hint-text-checkbox">
								<label className="block">{t("settings:uiSettings.promptInputArea.showHintText")}</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showSendButton}
								onChange={(e: any) => setCachedStateField("showSendButton", e.target.checked)}
								data-testid="show-send-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showSendButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showApiConfigurationButton}
								onChange={(e: any) =>
									setCachedStateField("showApiConfigurationButton", e.target.checked)
								}
								data-testid="show-api-configuration-button-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showApiConfigurationButton")}
								</label>
							</VSCodeCheckbox>

							<VSCodeCheckbox
								checked={showAutoApproveTab}
								onChange={(e: any) => setCachedStateField("showAutoApproveTab", e.target.checked)}
								data-testid="show-auto-approve-tab-checkbox">
								<label className="block">
									{t("settings:uiSettings.promptInputArea.showAutoApproveTab")}
								</label>
							</VSCodeCheckbox>
						</div>
					</div>

					{/* General UI Element Customization */}
					<div>
						<h4 className="font-medium mb-3">{t("settings:uiSettings.generalUI.title")}</h4>
						<div className="space-y-3 pl-4">
							<VSCodeCheckbox
								checked={showContextPercentageBar}
								onChange={(e: any) => setCachedStateField("showContextPercentageBar", e.target.checked)}
								data-testid="show-context-percentage-bar-checkbox">
								<label className="block">
									{t("settings:uiSettings.generalUI.showContextPercentageBar")}
								</label>
							</VSCodeCheckbox>
						</div>
					</div>
				</div>
			</Section>
		</div>
	)
}
