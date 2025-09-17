import React, { useState, useEffect } from "react"
import { VSCodeTextField, VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { type ProviderSettings } from "@roo-code/types"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"

interface CodexCliProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const CodexCli: React.FC<CodexCliProps> = ({ apiConfiguration, setApiConfigurationField }) => {
	const { t } = useAppTranslation()
	const [isSignedIn, setIsSignedIn] = useState(false)
	const [isSigningIn, setIsSigningIn] = useState(false)
	const [cliDetected, setCliDetected] = useState<boolean | null>(null)
	const [cliVersion, setCliVersion] = useState<string | null>(null)

	// Check if we have a session token stored
	useEffect(() => {
		// We can't directly access the secret storage from the webview,
		// but we can infer the signed-in state from whether the provider is working
		// For now, we'll rely on the backend to manage the session state
		const checkSignInStatus = async () => {
			// Request CLI detection to check if it's installed
			vscode.postMessage({ type: "codexCliDetect" })
		}
		checkSignInStatus()
	}, [])

	// Listen for messages from the extension
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "codexCliAuthResult":
					setIsSigningIn(false)
					if (message.success) {
						setIsSignedIn(true)
					}
					break
				case "codexCliDetectResult":
					setCliDetected(message.found)
					if (message.version) {
						setCliVersion(message.version)
					}
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handlePathChange = (e: Event | React.FormEvent<HTMLElement>) => {
		const element = e.target as HTMLInputElement
		setApiConfigurationField("codexCliPath", element.value)
	}

	const handleSignIn = () => {
		setIsSigningIn(true)
		vscode.postMessage({ type: "codexCliSignIn" })
	}

	const handleSignOut = () => {
		setIsSignedIn(false)
		vscode.postMessage({ type: "codexCliSignOut" })
	}

	const handleBaseUrlChange = (e: Event | React.FormEvent<HTMLElement>) => {
		const element = e.target as HTMLInputElement
		setApiConfigurationField("codexCliBaseUrl", element.value)
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Sign In/Sign Out Section */}
			<div className="flex flex-col gap-2">
				{isSignedIn ? (
					<>
						<div className="text-sm text-vscode-descriptionForeground">
							{t("settings:providers.codexCli.authenticatedMessage", {
								defaultValue: "You are signed in to Codex CLI",
							})}
						</div>
						<VSCodeButton appearance="secondary" onClick={handleSignOut} className="w-fit">
							{t("settings:providers.codexCli.signOutButton", { defaultValue: "Sign Out" })}
						</VSCodeButton>
					</>
				) : (
					<>
						<div className="text-sm text-vscode-descriptionForeground">
							{t("settings:providers.codexCli.signInMessage", {
								defaultValue: "Sign in to use Codex CLI without API keys",
							})}
						</div>
						<VSCodeButton
							appearance="primary"
							onClick={handleSignIn}
							disabled={isSigningIn}
							className="w-fit">
							{isSigningIn
								? t("settings:providers.codexCli.signingInButton", { defaultValue: "Signing In..." })
								: t("settings:providers.codexCli.signInButton", { defaultValue: "Sign In" })}
						</VSCodeButton>
					</>
				)}
			</div>

			{/* CLI Detection Status */}
			{cliDetected !== null && (
				<div className="text-sm">
					{cliDetected ? (
						<div className="text-vscode-testing-iconPassed">
							✓{" "}
							{t("settings:providers.codexCli.cliDetected", {
								defaultValue: "Codex CLI detected",
								version: cliVersion || "",
							})}
							{cliVersion && ` (${cliVersion})`}
						</div>
					) : (
						<div className="text-vscode-testing-iconFailed">
							✗{" "}
							{t("settings:providers.codexCli.cliNotDetected", {
								defaultValue: "Codex CLI not found in PATH",
							})}
						</div>
					)}
				</div>
			)}

			{/* CLI Path Configuration */}
			<div>
				<VSCodeTextField
					value={apiConfiguration?.codexCliPath || ""}
					style={{ width: "100%", marginTop: 3 }}
					type="text"
					onInput={handlePathChange}
					placeholder={t("settings:providers.codexCli.pathPlaceholder", {
						defaultValue: "codex (or full path to CLI)",
					})}>
					{t("settings:providers.codexCli.pathLabel", {
						defaultValue: "CLI Path (optional)",
					})}
				</VSCodeTextField>
				<p
					style={{
						fontSize: "12px",
						marginTop: 3,
						color: "var(--vscode-descriptionForeground)",
					}}>
					{t("settings:providers.codexCli.pathDescription", {
						defaultValue:
							"Leave empty to use 'codex' from PATH, or specify the full path to the CLI executable",
					})}
				</p>
			</div>

			{/* Base URL Configuration (Advanced) */}
			<div>
				<VSCodeTextField
					value={apiConfiguration?.codexCliBaseUrl || ""}
					style={{ width: "100%", marginTop: 3 }}
					type="text"
					onInput={handleBaseUrlChange}
					placeholder={t("settings:providers.codexCli.baseUrlPlaceholder", {
						defaultValue: "http://localhost:3000/v1",
					})}>
					{t("settings:providers.codexCli.baseUrlLabel", {
						defaultValue: "Base URL (optional)",
					})}
				</VSCodeTextField>
				<p
					style={{
						fontSize: "12px",
						marginTop: 3,
						color: "var(--vscode-descriptionForeground)",
					}}>
					{t("settings:providers.codexCli.baseUrlDescription", {
						defaultValue:
							"Override the base URL if the CLI exposes a custom gateway (defaults to http://localhost:3000/v1)",
					})}
				</p>
			</div>
		</div>
	)
}
