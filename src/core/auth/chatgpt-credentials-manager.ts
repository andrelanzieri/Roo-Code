import * as vscode from "vscode"
import { type ChatGptCredentials, chatGptCredentialsSchema } from "@roo-code/types"

/**
 * Manages ChatGPT credentials in VS Code's SecretStorage
 */
export class ChatGptCredentialsManager {
	private static readonly API_KEY_KEY = "roo.openai.chatgpt.apiKey"
	private static readonly ID_TOKEN_KEY = "roo.openai.chatgpt.idToken"
	private static readonly REFRESH_TOKEN_KEY = "roo.openai.chatgpt.refreshToken"
	private static readonly LAST_REFRESH_KEY = "roo.openai.chatgpt.lastRefreshIso"
	private static readonly RESPONSE_ID_KEY = "roo.openai.chatgpt.responseId"

	constructor(private context: vscode.ExtensionContext) {}

	/**
	 * Store ChatGPT credentials in SecretStorage
	 */
	async storeCredentials(credentials: ChatGptCredentials): Promise<void> {
		const promises: Thenable<void>[] = []

		if (credentials.apiKey !== undefined) {
			promises.push(this.context.secrets.store(ChatGptCredentialsManager.API_KEY_KEY, credentials.apiKey))
		}

		promises.push(this.context.secrets.store(ChatGptCredentialsManager.ID_TOKEN_KEY, credentials.idToken))
		promises.push(this.context.secrets.store(ChatGptCredentialsManager.REFRESH_TOKEN_KEY, credentials.refreshToken))

		if (credentials.lastRefreshIso) {
			promises.push(
				this.context.secrets.store(ChatGptCredentialsManager.LAST_REFRESH_KEY, credentials.lastRefreshIso),
			)
		}

		if (credentials.responseId) {
			promises.push(this.context.secrets.store(ChatGptCredentialsManager.RESPONSE_ID_KEY, credentials.responseId))
		}

		await Promise.all(promises)
	}

	/**
	 * Retrieve ChatGPT credentials from SecretStorage
	 */
	async getCredentials(): Promise<ChatGptCredentials | null> {
		const [apiKey, idToken, refreshToken, lastRefreshIso, responseId] = await Promise.all([
			this.context.secrets.get(ChatGptCredentialsManager.API_KEY_KEY),
			this.context.secrets.get(ChatGptCredentialsManager.ID_TOKEN_KEY),
			this.context.secrets.get(ChatGptCredentialsManager.REFRESH_TOKEN_KEY),
			this.context.secrets.get(ChatGptCredentialsManager.LAST_REFRESH_KEY),
			this.context.secrets.get(ChatGptCredentialsManager.RESPONSE_ID_KEY),
		])

		// If no ID token, user is not authenticated
		if (!idToken || !refreshToken) {
			return null
		}

		const credentials: ChatGptCredentials = {
			apiKey,
			idToken,
			refreshToken,
			lastRefreshIso,
			responseId,
		}

		// Validate the credentials structure
		const result = chatGptCredentialsSchema.safeParse(credentials)
		if (!result.success) {
			console.error("Invalid ChatGPT credentials in storage:", result.error)
			return null
		}

		return result.data
	}

	/**
	 * Get just the API key
	 */
	async getApiKey(): Promise<string | undefined> {
		return this.context.secrets.get(ChatGptCredentialsManager.API_KEY_KEY)
	}

	/**
	 * Update just the API key
	 */
	async updateApiKey(apiKey: string): Promise<void> {
		await this.context.secrets.store(ChatGptCredentialsManager.API_KEY_KEY, apiKey)
	}

	/**
	 * Update the response ID for conversation continuity
	 */
	async updateResponseId(responseId: string): Promise<void> {
		await this.context.secrets.store(ChatGptCredentialsManager.RESPONSE_ID_KEY, responseId)
	}

	/**
	 * Update tokens after refresh
	 */
	async updateTokens(idToken: string, refreshToken: string, apiKey?: string): Promise<void> {
		const promises: Thenable<void>[] = [
			this.context.secrets.store(ChatGptCredentialsManager.ID_TOKEN_KEY, idToken),
			this.context.secrets.store(ChatGptCredentialsManager.REFRESH_TOKEN_KEY, refreshToken),
			this.context.secrets.store(ChatGptCredentialsManager.LAST_REFRESH_KEY, new Date().toISOString()),
		]

		if (apiKey) {
			promises.push(this.context.secrets.store(ChatGptCredentialsManager.API_KEY_KEY, apiKey))
		}

		await Promise.all(promises)
	}

	/**
	 * Clear all ChatGPT credentials
	 */
	async clearCredentials(): Promise<void> {
		await Promise.all([
			this.context.secrets.delete(ChatGptCredentialsManager.API_KEY_KEY),
			this.context.secrets.delete(ChatGptCredentialsManager.ID_TOKEN_KEY),
			this.context.secrets.delete(ChatGptCredentialsManager.REFRESH_TOKEN_KEY),
			this.context.secrets.delete(ChatGptCredentialsManager.LAST_REFRESH_KEY),
			this.context.secrets.delete(ChatGptCredentialsManager.RESPONSE_ID_KEY),
		])
	}

	/**
	 * Check if user is authenticated with ChatGPT
	 */
	async isAuthenticated(): Promise<boolean> {
		const credentials = await this.getCredentials()
		return credentials !== null && !!credentials.idToken && !!credentials.refreshToken
	}

	/**
	 * Get authentication status with details
	 */
	async getAuthStatus(): Promise<{
		isAuthenticated: boolean
		hasApiKey: boolean
		lastRefresh?: string
		needsRefresh?: boolean
	}> {
		const credentials = await this.getCredentials()

		if (!credentials) {
			return {
				isAuthenticated: false,
				hasApiKey: false,
			}
		}

		// Check if tokens need refresh (older than 28 days)
		let needsRefresh = false
		if (credentials.lastRefreshIso) {
			const lastRefresh = new Date(credentials.lastRefreshIso)
			const daysSinceRefresh = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60 * 24)
			needsRefresh = daysSinceRefresh > 28
		}

		return {
			isAuthenticated: true,
			hasApiKey: !!credentials.apiKey,
			lastRefresh: credentials.lastRefreshIso,
			needsRefresh,
		}
	}
}

/**
 * Global instance of the credentials manager
 */
let credentialsManager: ChatGptCredentialsManager | undefined

/**
 * Initialize the credentials manager
 */
export function initializeCredentialsManager(context: vscode.ExtensionContext): ChatGptCredentialsManager {
	if (!credentialsManager) {
		credentialsManager = new ChatGptCredentialsManager(context)
	}
	return credentialsManager
}

/**
 * Get the credentials manager instance
 */
export function getCredentialsManager(): ChatGptCredentialsManager {
	if (!credentialsManager) {
		throw new Error("ChatGptCredentialsManager not initialized. Call initializeCredentialsManager first.")
	}
	return credentialsManager
}
