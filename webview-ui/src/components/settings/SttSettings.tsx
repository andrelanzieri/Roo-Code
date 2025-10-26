import React, { memo } from "react"
import { Mic } from "lucide-react"
import { VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { Section } from "./Section"
import { SectionHeader } from "./SectionHeader"
import { SetCachedStateField } from "./types"
import { ExtensionStateContextType } from "@/context/ExtensionStateContext"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui"
import type { ProviderSettings } from "@roo-code/types"

interface SttSettingsProps {
	sttEnabled?: boolean
	sttProvider?: string
	sttAutoStopTimeout?: number
	sttAutoSend?: boolean
	sttAssemblyAiApiKey?: string
	sttOpenAiWhisperApiKey?: string
	setCachedStateField: SetCachedStateField<keyof ExtensionStateContextType>
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
}

export const SttSettings = memo(
	({
		sttEnabled = false,
		sttProvider = "none",
		sttAutoStopTimeout = 3,
		sttAutoSend = false,
		sttAssemblyAiApiKey = "",
		sttOpenAiWhisperApiKey = "",
		setCachedStateField: _setCachedStateField,
		setApiConfigurationField,
	}: SttSettingsProps) => {
		const { t } = useAppTranslation()

		return (
			<div>
				<SectionHeader>
					<div className="flex items-center gap-2">
						<Mic className="w-4" />
						<div>{t("settings:stt.title")}</div>
					</div>
				</SectionHeader>

				<Section>
					{/* Enable STT */}
					<div>
						<VSCodeCheckbox
							checked={sttEnabled}
							onChange={(e: any) => setApiConfigurationField("sttEnabled", e.target.checked)}>
							<span className="font-medium">{t("settings:stt.enabled.label")}</span>
						</VSCodeCheckbox>
						<div className="text-vscode-descriptionForeground text-sm mt-1">
							{t("settings:stt.enabled.description")}
						</div>
					</div>

					{sttEnabled && (
						<div className="flex flex-col gap-3 pl-3 border-l-2 border-vscode-button-background">
							{/* STT Provider */}
							<div>
								<label className="block font-medium mb-1">{t("settings:stt.provider.label")}</label>
								<Select
									value={sttProvider}
									onValueChange={(value) =>
										setApiConfigurationField(
											"sttProvider",
											value as "assemblyai" | "openai-whisper" | "none",
										)
									}>
									<SelectTrigger id="stt-provider">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="none">{t("settings:stt.provider.none")}</SelectItem>
										<SelectItem value="assemblyai">
											{t("settings:stt.provider.assemblyai")}
										</SelectItem>
										<SelectItem value="openai-whisper">
											{t("settings:stt.provider.openaiWhisper")}
										</SelectItem>
									</SelectContent>
								</Select>
								<div className="text-vscode-descriptionForeground text-sm mt-1">
									{t("settings:stt.provider.description")}
								</div>
							</div>

							{/* AssemblyAI API Key */}
							{sttProvider === "assemblyai" && (
								<div>
									<label className="block font-medium mb-1">
										{t("settings:stt.assemblyaiKey.label")}
									</label>
									<VSCodeTextField
										value={sttAssemblyAiApiKey}
										onChange={(e: any) =>
											setApiConfigurationField("sttAssemblyAiApiKey", e.target.value)
										}
										placeholder={t("settings:stt.assemblyaiKey.placeholder")}
										style={{ width: "100%" }}
									/>
									<div className="text-vscode-descriptionForeground text-sm mt-1">
										{t("settings:stt.openaiKey.description")}
									</div>
									<div className="text-vscode-descriptionForeground text-sm mt-1">
										{t("settings:stt.assemblyaiKey.description")}
									</div>
								</div>
							)}

							{/* OpenAI Whisper API Key */}
							{sttProvider === "openai-whisper" && (
								<div>
									<label className="block font-medium mb-1">
										{t("settings:stt.openaiKey.label")}
									</label>
									<VSCodeTextField
										value={sttOpenAiWhisperApiKey}
										onChange={(e: any) =>
											setApiConfigurationField("sttOpenAiWhisperApiKey", e.target.value)
										}
										placeholder={t("settings:stt.openaiKey.placeholder")}
										style={{ width: "100%" }}
									/>
								</div>
							)}

							{/* Auto-stop Timeout */}
							{sttProvider !== "none" && (
								<div>
									<label className="block font-medium mb-1">
										{t("settings:stt.autoStopTimeout.label")}
									</label>
									<VSCodeTextField
										value={sttAutoStopTimeout.toString()}
										onChange={(e: any) => {
											const value = parseInt(e.target.value, 10)
											if (!isNaN(value) && value >= 1 && value <= 30) {
												setApiConfigurationField("sttAutoStopTimeout", value)
											}
										}}
										placeholder="1-30"
										style={{ width: "100px" }}
									/>
									<div className="text-vscode-descriptionForeground text-sm mt-1">
										{t("settings:stt.autoStopTimeout.description")}
									</div>
								</div>
							)}

							{/* Auto-send */}
							{sttProvider !== "none" && (
								<div>
									<VSCodeCheckbox
										checked={sttAutoSend}
										onChange={(e: any) =>
											setApiConfigurationField("sttAutoSend", e.target.checked)
										}>
										<span className="font-medium">{t("settings:stt.autoSend.label")}</span>
									</VSCodeCheckbox>
									<div className="text-vscode-descriptionForeground text-sm mt-1">
										{t("settings:stt.autoSend.description")}
									</div>
								</div>
							)}
						</div>
					)}
				</Section>
			</div>
		)
	},
)

SttSettings.displayName = "SttSettings"
