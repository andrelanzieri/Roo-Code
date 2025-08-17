import React, { useState, useCallback } from "react"
import { VSCodeButton, VSCodeTextArea, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useTranslation } from "react-i18next"
import { vscode } from "@src/utils/vscode"

interface CrashReportDialogProps {
	isOpen: boolean
	onClose: () => void
	errorDetails?: {
		message?: string
		stack?: string
		componentStack?: string
		context?: string
		timestamp?: number
	}
	source?: "code-index" | "human-relay" | "general"
}

export const CrashReportDialog: React.FC<CrashReportDialogProps> = ({
	isOpen,
	onClose,
	errorDetails,
	source = "general",
}) => {
	const { t } = useTranslation(["common", "crashReport"])
	const [description, setDescription] = useState("")
	const [email, setEmail] = useState("")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [submitSuccess, setSubmitSuccess] = useState(false)

	const handleSubmit = useCallback(async () => {
		// Validate that description is not empty
		if (!description.trim()) {
			return
		}

		setIsSubmitting(true)

		const crashReport = {
			source,
			description,
			email,
			errorDetails,
			timestamp: Date.now(),
			userAgent: navigator.userAgent,
		}

		// Send crash report to backend
		vscode.postMessage({
			type: "submitCrashReport",
			crashReport,
		})

		// Simulate submission delay
		setTimeout(() => {
			setIsSubmitting(false)
			setSubmitSuccess(true)
			// Auto-close after success
			setTimeout(() => {
				onClose()
				setSubmitSuccess(false)
				setDescription("")
				setEmail("")
			}, 2000)
		}, 1000)
	}, [source, description, email, errorDetails, onClose])

	const handleCopyDetails = useCallback(() => {
		const details = JSON.stringify(errorDetails, null, 2)
		navigator.clipboard.writeText(details)
		vscode.postMessage({
			type: "showNotification",
			text: t("crashReport:copiedToClipboard"),
		})
	}, [errorDetails, t])

	if (!isOpen) return null

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-vscode-editor-background border border-vscode-panel-border rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
				<h2 className="text-xl font-bold mb-4 text-vscode-foreground">{t("crashReport:title")}</h2>

				{submitSuccess ? (
					<div className="text-center py-8">
						<div className="text-green-500 text-lg mb-2">✓</div>
						<p className="text-vscode-foreground">{t("crashReport:submitSuccess")}</p>
					</div>
				) : (
					<>
						<div className="mb-4">
							<p className="text-vscode-descriptionForeground mb-2">{t("crashReport:description")}</p>
						</div>

						{errorDetails && (
							<div className="mb-4">
								<div className="flex justify-between items-center mb-2">
									<label className="text-sm font-medium text-vscode-foreground">
										{t("crashReport:errorDetails")}
									</label>
									<VSCodeButton appearance="secondary" onClick={handleCopyDetails}>
										{t("crashReport:copyDetails")}
									</VSCodeButton>
								</div>
								<div className="bg-vscode-input-background border border-vscode-input-border rounded p-3 max-h-40 overflow-y-auto">
									<pre className="text-xs text-vscode-foreground whitespace-pre-wrap">
										{errorDetails.message && (
											<>
												<strong>Message:</strong> {errorDetails.message}
												{"\n\n"}
											</>
										)}
										{errorDetails.context && (
											<>
												<strong>Context:</strong> {errorDetails.context}
												{"\n\n"}
											</>
										)}
										{errorDetails.stack && (
											<>
												<strong>Stack:</strong>
												{"\n"}
												{errorDetails.stack}
											</>
										)}
									</pre>
								</div>
							</div>
						)}

						<div className="mb-4">
							<label className="block text-sm font-medium text-vscode-foreground mb-2">
								{t("crashReport:whatHappened")}
							</label>
							<VSCodeTextArea
								value={description}
								onChange={(e: any) => setDescription(e.target.value)}
								placeholder={t("crashReport:whatHappenedPlaceholder")}
								rows={4}
								className="w-full"
							/>
						</div>

						<div className="mb-6">
							<label className="block text-sm font-medium text-vscode-foreground mb-2">
								{t("crashReport:email")} ({t("crashReport:optional")})
							</label>
							<VSCodeTextField
								value={email}
								onChange={(e: any) => setEmail(e.target.value)}
								placeholder={t("crashReport:emailPlaceholder")}
								type="email"
								className="w-full"
							/>
							<p className="text-xs text-vscode-descriptionForeground mt-1">
								{t("crashReport:emailDescription")}
							</p>
						</div>

						<div className="flex justify-end gap-2">
							<VSCodeButton appearance="secondary" onClick={onClose} disabled={isSubmitting}>
								{t("common:cancel")}
							</VSCodeButton>
							<VSCodeButton onClick={handleSubmit} disabled={isSubmitting || !description.trim()}>
								{isSubmitting ? t("crashReport:submitting") : t("crashReport:submit")}
							</VSCodeButton>
						</div>

						{source === "human-relay" && (
							<div className="mt-4 p-3 bg-vscode-textBlockQuote-background border-l-4 border-vscode-textBlockQuote-border">
								<p className="text-sm text-vscode-foreground">{t("crashReport:humanRelayNote")}</p>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	)
}
