import { useState, useCallback, useEffect } from "react"
import { VSCodeButton, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ModelInfo, ProviderSettings } from "@roo-code/types"

import { inputEventTransform } from "../transforms"

type CodexCliProps = {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: keyof ProviderSettings, value: ProviderSettings[keyof ProviderSettings]) => void
	selectedModelInfo?: ModelInfo
}

export const CodexCli = ({ apiConfiguration, setApiConfigurationField }: CodexCliProps) => {
	const [isAuthenticated, setIsAuthenticated] = useState(false)
	const [isCheckingAuth, setIsCheckingAuth] = useState(false)
	const [isSigningIn, setIsSigningIn] = useState(false)
	const [isSigningOut, setIsSigningOut] = useState(false)
	const [cliAvailable, setCliAvailable] = useState<boolean | null>(null)
	const [customPath, setCustomPath] = useState(apiConfiguration?.codexCliPath || "")
	const [showCustomPath, setShowCustomPath] = useState(!!apiConfiguration?.codexCliPath)

	// Check authentication status on mount and when custom path changes
	useEffect(() => {
		const checkCliAvailability = async () => {
			try {
				// For now, assume CLI is available
				// In a real implementation, this would check if the CLI is installed
				setCliAvailable(true)
			} catch (error) {
				console.error("Failed to check CLI availability:", error)
				setCliAvailable(false)
			}
		}

		const checkAuthStatus = async () => {
			setIsCheckingAuth(true)
			try {
				// Check if we have a stored session token
				if (apiConfiguration?.codexCliSessionToken) {
					setIsAuthenticated(true)
				} else {
					setIsAuthenticated(false)
				}
			} catch (error) {
				console.error("Failed to check auth status:", error)
				setIsAuthenticated(false)
			} finally {
				setIsCheckingAuth(false)
			}
		}

		checkAuthStatus()
		checkCliAvailability()
	}, [customPath, apiConfiguration?.codexCliSessionToken])

	const handleSignIn = async () => {
		setIsSigningIn(true)
		try {
			// Simulate sign-in process
			// In a real implementation, this would open a browser for authentication
			setTimeout(() => {
				// Simulate successful sign-in with a mock token
				const mockToken = "mock-session-token-" + Date.now()
				setApiConfigurationField("codexCliSessionToken", mockToken)
				setIsAuthenticated(true)
				setIsSigningIn(false)
			}, 1000)
		} catch (error) {
			console.error("Failed to sign in:", error)
			setIsSigningIn(false)
		}
	}

	const handleSignOut = async () => {
		setIsSigningOut(true)
		try {
			// Clear the session token
			setApiConfigurationField("codexCliSessionToken", undefined)
			setIsAuthenticated(false)
		} catch (error) {
			console.error("Failed to sign out:", error)
		} finally {
			setIsSigningOut(false)
		}
	}

	const handleCustomPathChange = useCallback(
		(event: any) => {
			const value = inputEventTransform(event)
			setCustomPath(value)
			setApiConfigurationField("codexCliPath", value || undefined)
		},
		[setApiConfigurationField],
	)

	return (
		<div className="flex flex-col gap-4">
			{/* Authentication Status */}
			<div className="flex items-center justify-between p-3 bg-vscode-editor-background rounded">
				<div className="flex items-center gap-2">
					<span className="text-sm font-medium">Authentication Status:</span>
					{isCheckingAuth ? (
						<span className="text-sm text-vscode-descriptionForeground">Checking...</span>
					) : (
						<span
							className={`text-sm font-semibold ${
								isAuthenticated ? "text-vscode-testing-iconPassed" : "text-vscode-testing-iconFailed"
							}`}>
							{isAuthenticated ? "Signed In" : "Not Signed In"}
						</span>
					)}
				</div>

				{/* Sign In/Out Buttons */}
				<div className="flex gap-2">
					{!isAuthenticated ? (
						<VSCodeButton
							onClick={handleSignIn}
							disabled={isSigningIn || isCheckingAuth}
							appearance="primary">
							{isSigningIn ? "Signing In..." : "Sign In"}
						</VSCodeButton>
					) : (
						<VSCodeButton onClick={handleSignOut} disabled={isSigningOut} appearance="secondary">
							{isSigningOut ? "Signing Out..." : "Sign Out"}
						</VSCodeButton>
					)}
				</div>
			</div>

			{/* CLI Availability Status */}
			{cliAvailable === false && (
				<div className="p-3 bg-vscode-inputValidation-warningBackground rounded">
					<p className="text-sm text-vscode-inputValidation-warningForeground mb-2">
						Codex CLI not found in your system PATH.
					</p>
					<p className="text-xs text-vscode-descriptionForeground">
						Please install the Codex CLI or provide a custom path below.
					</p>
				</div>
			)}

			{/* Custom CLI Path */}
			<div className="flex flex-col gap-2">
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={showCustomPath}
						onChange={(e) => setShowCustomPath(e.target.checked)}
						className="codicon codicon-check"
					/>
					<span className="text-sm">Use custom CLI path</span>
				</label>

				{showCustomPath && (
					<VSCodeTextField
						value={customPath}
						onInput={handleCustomPathChange}
						placeholder="codex"
						className="w-full">
						<label className="block text-xs text-vscode-descriptionForeground mb-1">
							Path to the Codex CLI executable
						</label>
					</VSCodeTextField>
				)}
			</div>

			{/* Information */}
			<div className="p-3 bg-vscode-editor-inactiveSelectionBackground rounded">
				<h4 className="text-sm font-medium mb-2">About Codex CLI</h4>
				<ul className="text-xs text-vscode-descriptionForeground space-y-1">
					<li>• Same models and capabilities as OpenAI</li>
					<li>• No API key management required</li>
					<li>• Secure local authentication</li>
					<li>• Automatic session management</li>
				</ul>
			</div>

			{/* Note about no API key */}
			<div className="text-xs text-vscode-descriptionForeground italic">
				This provider uses local authentication instead of API keys. Sign in once and your session will be
				managed automatically.
			</div>
		</div>
	)
}
