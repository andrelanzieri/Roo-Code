import { useState, useEffect } from "react"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ProviderSettings } from "@roo-code/types"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { vscode } from "@src/utils/vscode"

import { inputEventTransform } from "../transforms"

type CodexCliNativeProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
}

export const CodexCliNative = ({ apiConfiguration, setApiConfigurationField }: CodexCliNativeProps) => {
	const { t } = useAppTranslation()
	const [isSignedIn, setIsSignedIn] = useState(false)
	const [isSigningIn, setIsSigningIn] = useState(false)
	const [showCustomPath, setShowCustomPath] = useState(false)

	// Check if user is signed in by checking if token exists
	useEffect(() => {
		// Request token status from extension
		vscode.postMessage({ type: "codexCliNativeCheckToken" })
	}, [])

	// Listen for token status updates
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			if (message.type === "codexCliNativeTokenStatus") {
				setIsSignedIn(message.hasToken)
			} else if (message.type === "codexCliNativeSignInResult") {
				setIsSigningIn(false)
				if (message.success) {
					setIsSignedIn(true)
				}
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleSignIn = () => {
		setIsSigningIn(true)
		vscode.postMessage({ type: "codexCliNativeSignIn" })
	}

	const handleSignOut = () => {
		vscode.postMessage({ type: "codexCliNativeSignOut" })
		setIsSignedIn(false)
	}

	const handleDetect = () => {
		vscode.postMessage({ type: "codexCliNativeDetect" })
	}

	const handlePathChange = (event: Event | React.FormEvent<HTMLElement>) => {
		const value = inputEventTransform(event as Event)
		setApiConfigurationField("codexCliPath", value as string)
	}

	return (
		<div className="flex flex-col gap-3">
			{isSignedIn ? (
				<>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.codexCliNative.signedInMessage")}
					</div>
					<VSCodeButton appearance="secondary" onClick={handleSignOut} className="w-fit">
						{t("settings:providers.codexCliNative.signOutButton")}
					</VSCodeButton>
				</>
			) : (
				<>
					<div className="text-sm text-vscode-descriptionForeground">
						{t("settings:providers.codexCliNative.signInMessage")}
					</div>
					<div className="flex gap-2">
						<VSCodeButton
							appearance="primary"
							onClick={handleSignIn}
							disabled={isSigningIn}
							className="w-fit">
							{isSigningIn
								? t("settings:providers.codexCliNative.signingInButton")
								: t("settings:providers.codexCliNative.signInButton")}
						</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={handleDetect} className="w-fit">
							{t("settings:providers.codexCliNative.detectButton")}
						</VSCodeButton>
					</div>
				</>
			)}

			<div className="mt-2">
				<button
					type="button"
					onClick={() => setShowCustomPath(!showCustomPath)}
					className="text-sm text-vscode-link hover:underline cursor-pointer">
					{showCustomPath
						? t("settings:providers.codexCliNative.hideCustomPath")
						: t("settings:providers.codexCliNative.showCustomPath")}
				</button>
			</div>

			{showCustomPath && (
				<div>
					<VSCodeTextField
						value={apiConfiguration?.codexCliPath || ""}
						type="text"
						onInput={handlePathChange}
						placeholder={t("settings:providers.codexCliNative.pathPlaceholder")}
						className="w-full">
						<label className="block font-medium mb-1">
							{t("settings:providers.codexCliNative.pathLabel")}
						</label>
					</VSCodeTextField>
					<div className="text-sm text-vscode-descriptionForeground mt-1">
						{t("settings:providers.codexCliNative.pathDescription")}
					</div>
				</div>
			)}
		</div>
	)
}
