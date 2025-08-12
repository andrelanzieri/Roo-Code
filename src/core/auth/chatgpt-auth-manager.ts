import * as vscode from "vscode"
import {
	generateState,
	generatePKCE,
	buildAuthorizationUrl,
	storeOAuthState,
	findAvailablePort,
	isTokenExpired,
} from "./oauth-helpers"
import { OAuthCallbackServer, exchangeCodeForTokens, refreshTokens } from "./oauth-server"
import { exchangeTokenForApiKey, redeemComplimentaryCredits } from "./token-exchange"
import { ChatGptCredentialsManager, initializeCredentialsManager } from "./chatgpt-credentials-manager"
import type { OAuthState } from "@roo-code/types"

/**
 * Main manager for ChatGPT OAuth authentication
 */
export class ChatGptAuthManager {
	private credentialsManager: ChatGptCredentialsManager

	constructor(private context: vscode.ExtensionContext) {
		this.credentialsManager = initializeCredentialsManager(context)
	}

	/**
	 * Sign in with ChatGPT using OAuth
	 */
	async signIn(): Promise<boolean> {
		try {
			// Check if already authenticated
			if (await this.credentialsManager.isAuthenticated()) {
				const result = await vscode.window.showInformationMessage(
					"You are already signed in with ChatGPT. Do you want to sign in with a different account?",
					"Yes",
					"No",
				)

				if (result !== "Yes") {
					return true
				}

				// Clear existing credentials
				await this.credentialsManager.clearCredentials()
			}

			// Generate OAuth parameters
			const state = generateState()
			const { codeVerifier, codeChallenge } = generatePKCE()

			// Find available port for callback server
			const port = await findAvailablePort()

			// Store state for CSRF protection
			const oauthState: OAuthState = {
				state,
				codeVerifier,
				timestamp: Date.now(),
			}
			await storeOAuthState(this.context, oauthState)

			// Start callback server
			const server = new OAuthCallbackServer(port)
			await server.start(this.context)

			// Build authorization URL
			const authUrl = buildAuthorizationUrl(state, codeChallenge, port)

			// Open browser for authentication
			await vscode.env.openExternal(vscode.Uri.parse(authUrl))

			// Show progress notification
			const authPromise = vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.Notification,
					title: "Signing in with ChatGPT",
					cancellable: true,
				},
				async (progress, token) => {
					progress.report({ message: "Waiting for authentication..." })

					// Wait for authorization code
					const code = await Promise.race([
						server.waitForCode(),
						new Promise<never>((_, reject) => {
							token.onCancellationRequested(() => {
								reject(new Error("Authentication cancelled"))
							})
						}),
					])

					progress.report({ increment: 33, message: "Exchanging code for tokens..." })

					// Exchange code for tokens
					const tokens = await exchangeCodeForTokens(code, codeVerifier, port)

					progress.report({ increment: 33, message: "Getting API key..." })

					// Exchange tokens for API key
					const apiKey = await exchangeTokenForApiKey(tokens.idToken)

					if (!apiKey) {
						throw new Error("Failed to obtain API key")
					}

					// Store credentials
					await this.credentialsManager.storeCredentials({
						apiKey,
						idToken: tokens.idToken,
						refreshToken: tokens.refreshToken,
						lastRefreshIso: new Date().toISOString(),
					})

					progress.report({ increment: 34, message: "Authentication complete!" })

					// Try to redeem complimentary credits (best effort)
					redeemComplimentaryCredits(tokens.idToken).catch(() => {})

					return true
				},
			)

			const result = await authPromise
			server.stop()

			if (result) {
				vscode.window.showInformationMessage("Successfully signed in with ChatGPT!")
			}

			return result
		} catch (error: any) {
			vscode.window.showErrorMessage(`Authentication failed: ${error.message}`)
			return false
		}
	}

	/**
	 * Sign out from ChatGPT
	 */
	async signOut(): Promise<void> {
		const result = await vscode.window.showWarningMessage(
			"Are you sure you want to sign out from ChatGPT?",
			"Yes",
			"No",
		)

		if (result === "Yes") {
			await this.credentialsManager.clearCredentials()
			vscode.window.showInformationMessage("Signed out from ChatGPT")
		}
	}

	/**
	 * Refresh credentials if needed
	 */
	async refreshCredentials(): Promise<boolean> {
		try {
			const credentials = await this.credentialsManager.getCredentials()

			if (!credentials) {
				return false
			}

			// Check if tokens need refresh
			if (!isTokenExpired(credentials.idToken)) {
				return true // No refresh needed
			}

			// Refresh tokens
			const tokens = await refreshTokens(credentials.refreshToken)

			// Exchange new tokens for API key
			const apiKey = await exchangeTokenForApiKey(tokens.idToken)

			if (!apiKey) {
				throw new Error("Failed to obtain API key after refresh")
			}

			// Update stored credentials
			await this.credentialsManager.updateTokens(
				tokens.idToken,
				tokens.refreshToken || credentials.refreshToken,
				apiKey,
			)

			return true
		} catch (error: any) {
			console.error("Failed to refresh credentials:", error)
			return false
		}
	}

	/**
	 * Get authentication status
	 */
	async getAuthStatus(): Promise<{
		isAuthenticated: boolean
		hasApiKey: boolean
		needsRefresh?: boolean
	}> {
		return this.credentialsManager.getAuthStatus()
	}

	/**
	 * Import credentials from Codex CLI auth.json file
	 */
	async importFromCodexCli(): Promise<boolean> {
		try {
			const homeDir = process.env.HOME || process.env.USERPROFILE
			if (!homeDir) {
				throw new Error("Could not determine home directory")
			}

			const authJsonPath = `${homeDir}/.codex/auth.json`
			const fs = await import("fs/promises")

			// Check if file exists
			try {
				await fs.access(authJsonPath)
			} catch {
				vscode.window.showErrorMessage(
					"Codex CLI auth.json not found. Please ensure you have authenticated with Codex CLI first.",
				)
				return false
			}

			// Read and parse auth.json
			const authJsonContent = await fs.readFile(authJsonPath, "utf-8")
			const authJson = JSON.parse(authJsonContent)

			// Validate structure
			if (!authJson.tokens?.id_token || !authJson.tokens?.refresh_token) {
				throw new Error("Invalid auth.json format")
			}

			// Store credentials
			await this.credentialsManager.storeCredentials({
				apiKey: authJson.OPENAI_API_KEY,
				idToken: authJson.tokens.id_token,
				refreshToken: authJson.tokens.refresh_token,
				lastRefreshIso: authJson.last_refresh || new Date().toISOString(),
			})

			vscode.window.showInformationMessage("Successfully imported credentials from Codex CLI")
			return true
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to import from Codex CLI: ${error.message}`)
			return false
		}
	}

	/**
	 * Import credentials from pasted auth.json content
	 */
	async importFromPaste(): Promise<boolean> {
		try {
			const input = await vscode.window.showInputBox({
				prompt: "Paste the contents of your Codex CLI auth.json file",
				placeHolder: '{"OPENAI_API_KEY": "...", "tokens": {...}}',
				ignoreFocusOut: true,
				validateInput: (value) => {
					if (!value) {
						return "Please paste the auth.json content"
					}
					try {
						JSON.parse(value)
						return null
					} catch {
						return "Invalid JSON format"
					}
				},
			})

			if (!input) {
				return false
			}

			const authJson = JSON.parse(input)

			// Validate structure
			if (!authJson.tokens?.id_token || !authJson.tokens?.refresh_token) {
				throw new Error("Invalid auth.json format - missing required tokens")
			}

			// Store credentials
			await this.credentialsManager.storeCredentials({
				apiKey: authJson.OPENAI_API_KEY,
				idToken: authJson.tokens.id_token,
				refreshToken: authJson.tokens.refresh_token,
				lastRefreshIso: authJson.last_refresh || new Date().toISOString(),
			})

			vscode.window.showInformationMessage("Successfully imported credentials")
			return true
		} catch (error: any) {
			vscode.window.showErrorMessage(`Failed to import credentials: ${error.message}`)
			return false
		}
	}
}

/**
 * Global instance of the auth manager
 */
let authManager: ChatGptAuthManager | undefined

/**
 * Initialize the auth manager
 */
export function initializeAuthManager(context: vscode.ExtensionContext): ChatGptAuthManager {
	if (!authManager) {
		authManager = new ChatGptAuthManager(context)
	}
	return authManager
}

/**
 * Get the auth manager instance
 */
export function getAuthManager(): ChatGptAuthManager {
	if (!authManager) {
		throw new Error("ChatGptAuthManager not initialized. Call initializeAuthManager first.")
	}
	return authManager
}
