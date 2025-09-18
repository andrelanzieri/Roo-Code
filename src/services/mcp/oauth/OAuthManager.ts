/**
 * OAuth Manager for MCP Servers
 * Orchestrates the complete OAuth 2.1 flow for HTTP-based MCP servers
 */

import * as vscode from "vscode"
import { OAuthClient } from "./OAuthClient"
import {
	AuthorizationServerMetadata,
	ClientRegistrationResponse,
	OAuthConfig,
	PKCEChallenge,
	StoredOAuthCredentials,
	TokenResponse,
	WWWAuthenticateChallenge,
} from "./types"

export class OAuthManager {
	private oauthClients: Map<string, OAuthClient> = new Map()
	private authorizationInProgress: Map<string, boolean> = new Map()

	constructor(private readonly context: vscode.ExtensionContext) {
		// Register URI handler for OAuth callbacks
		this.registerOAuthCallbackHandler()
	}

	/**
	 * Handle 401 Unauthorized response from MCP server
	 * Initiates OAuth flow if WWW-Authenticate header is present
	 * @param serverName MCP server name
	 * @param resourceUrl Resource server URL
	 * @param wwwAuthenticateHeader WWW-Authenticate header value
	 * @returns Access token if successful, null otherwise
	 */
	public async handle401Response(
		serverName: string,
		resourceUrl: string,
		wwwAuthenticateHeader: string,
	): Promise<string | null> {
		try {
			// Check if authorization is already in progress
			if (this.authorizationInProgress.get(serverName)) {
				vscode.window.showWarningMessage(`OAuth authorization already in progress for ${serverName}`)
				return null
			}

			// Get or create OAuth client for this server
			let client = this.oauthClients.get(serverName)
			if (!client) {
				client = new OAuthClient(serverName, resourceUrl, this.context)
				this.oauthClients.set(serverName, client)
			}

			// Parse WWW-Authenticate header
			const challenge = client.parseWWWAuthenticate(wwwAuthenticateHeader)

			if (challenge.scheme !== "Bearer") {
				vscode.window.showErrorMessage(
					`Unsupported authentication scheme: ${challenge.scheme}. Only Bearer is supported.`,
				)
				return null
			}

			// Check for existing valid credentials
			const existingCredentials = await client.getStoredCredentials()
			if (existingCredentials && !client.isTokenExpired(existingCredentials)) {
				return existingCredentials.accessToken
			}

			// If we have a refresh token, try to refresh
			if (existingCredentials?.refreshToken) {
				try {
					const tokens = await this.refreshToken(client, existingCredentials)
					return tokens.access_token
				} catch (error) {
					console.error("Failed to refresh token, initiating new authorization:", error)
					// Continue with new authorization flow
				}
			}

			// Start OAuth flow
			this.authorizationInProgress.set(serverName, true)

			try {
				// Step 1: Discover resource metadata (RFC 9728)
				vscode.window.showInformationMessage(`Discovering OAuth configuration for ${serverName}...`)
				const resourceMetadata = await client.discoverResourceMetadata(resourceUrl)

				// Step 2: Select authorization server (for now, use the first one)
				const authServerUrl = resourceMetadata.authorization_servers[0]

				// Step 3: Discover authorization server metadata (RFC 8414 + OIDC)
				const authMetadata = await client.discoverAuthorizationServerMetadata(authServerUrl)

				// Step 4: Check for existing client registration or perform dynamic registration
				let clientRegistration = await client.getStoredClientRegistration()

				if (!clientRegistration && authMetadata.registration_endpoint) {
					// Perform dynamic client registration (RFC 7591)
					vscode.window.showInformationMessage(`Registering client with authorization server...`)
					clientRegistration = await client.registerClient(authMetadata)
				} else if (!clientRegistration) {
					// No dynamic registration available, need manual configuration
					clientRegistration = await this.promptForClientCredentials(serverName)
					if (!clientRegistration) {
						return null
					}
				}

				// Step 5: Generate PKCE challenge
				const pkce = client.generatePKCEChallenge()
				await client.storePKCEVerifier(pkce)

				// Step 6: Build authorization URL
				const authUrl = client.buildAuthorizationUrl(
					authMetadata,
					clientRegistration.client_id,
					pkce,
					resourceUrl, // Use resource URL as resource indicator
					clientRegistration.scope,
				)

				// Step 7: Open browser for user authorization
				const authorized = await this.openAuthorizationUrl(authUrl, serverName)
				if (!authorized) {
					return null
				}

				// Step 8: Wait for callback (handled by URI handler)
				const tokens = await this.waitForTokens(serverName)
				if (!tokens) {
					return null
				}

				return tokens.access_token
			} finally {
				this.authorizationInProgress.delete(serverName)
			}
		} catch (error) {
			console.error("OAuth flow failed:", error)
			vscode.window.showErrorMessage(
				`OAuth authentication failed for ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
			)
			this.authorizationInProgress.delete(serverName)
			return null
		}
	}

	/**
	 * Get valid access token for MCP server
	 * Refreshes token if needed
	 * @param serverName MCP server name
	 * @returns Access token or null
	 */
	public async getAccessToken(serverName: string): Promise<string | null> {
		const client = this.oauthClients.get(serverName)
		if (!client) {
			return null
		}

		const credentials = await client.getStoredCredentials()
		if (!credentials) {
			return null
		}

		// Check if token needs refresh
		if (client.isTokenExpired(credentials)) {
			if (!credentials.refreshToken) {
				// No refresh token, need new authorization
				return null
			}

			try {
				const tokens = await this.refreshToken(client, credentials)
				return tokens.access_token
			} catch (error) {
				console.error("Failed to refresh token:", error)
				// Clear invalid credentials
				await client.clearCredentials()
				return null
			}
		}

		return credentials.accessToken
	}

	/**
	 * Refresh access token
	 * @param client OAuth client
	 * @param credentials Stored credentials
	 * @returns New tokens
	 */
	private async refreshToken(client: OAuthClient, credentials: StoredOAuthCredentials): Promise<TokenResponse> {
		// Discover authorization server metadata
		const authServerUrl = await this.getAuthServerUrl(credentials.serverUrl)
		if (!authServerUrl) {
			throw new Error("Cannot determine authorization server URL")
		}

		const authMetadata = await client.discoverAuthorizationServerMetadata(authServerUrl)

		// Refresh token
		return await client.refreshAccessToken(
			authMetadata,
			credentials.refreshToken!,
			credentials.clientId,
			credentials.clientSecret,
			credentials.serverUrl,
		)
	}

	/**
	 * Get authorization server URL for a resource
	 * @param resourceUrl Resource server URL
	 * @returns Authorization server URL or null
	 */
	private async getAuthServerUrl(resourceUrl: string): Promise<string | null> {
		try {
			// Create temporary client to discover metadata
			const tempClient = new OAuthClient("temp", resourceUrl, this.context)
			const resourceMetadata = await tempClient.discoverResourceMetadata(resourceUrl)
			return resourceMetadata.authorization_servers[0] || null
		} catch (error) {
			console.error("Failed to get authorization server URL:", error)
			return null
		}
	}

	/**
	 * Prompt user for manual client credentials
	 * @param serverName Server name
	 * @returns Client registration or null
	 */
	private async promptForClientCredentials(serverName: string): Promise<ClientRegistrationResponse | null> {
		const clientId = await vscode.window.showInputBox({
			prompt: `Enter Client ID for ${serverName}`,
			placeHolder: "client-id",
			ignoreFocusOut: true,
		})

		if (!clientId) {
			return null
		}

		const clientSecret = await vscode.window.showInputBox({
			prompt: `Enter Client Secret for ${serverName} (leave empty for public client)`,
			placeHolder: "client-secret (optional)",
			password: true,
			ignoreFocusOut: true,
		})

		const redirectUri = `vscode://RooCodeInc.roo-code/oauth-callback`

		return {
			client_id: clientId,
			client_secret: clientSecret || undefined,
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
		}
	}

	/**
	 * Open authorization URL in browser
	 * @param authUrl Authorization URL
	 * @param serverName Server name
	 * @returns true if user proceeded with authorization
	 */
	private async openAuthorizationUrl(authUrl: string, serverName: string): Promise<boolean> {
		const result = await vscode.window.showInformationMessage(
			`Authorization required for MCP server "${serverName}". Click "Authorize" to open your browser and grant access.`,
			"Authorize",
			"Cancel",
		)

		if (result !== "Authorize") {
			return false
		}

		// Open browser
		await vscode.env.openExternal(vscode.Uri.parse(authUrl))
		return true
	}

	/**
	 * Wait for OAuth tokens after authorization
	 * @param serverName Server name
	 * @returns Tokens or null
	 */
	private async waitForTokens(serverName: string): Promise<TokenResponse | null> {
		return new Promise((resolve) => {
			// Set up a timeout
			const timeout = setTimeout(
				() => {
					vscode.window.showErrorMessage(`OAuth authorization timed out for ${serverName}`)
					resolve(null)
				},
				5 * 60 * 1000,
			) // 5 minutes timeout

			// Check for tokens periodically
			const checkInterval = setInterval(async () => {
				const client = this.oauthClients.get(serverName)
				if (!client) {
					clearInterval(checkInterval)
					clearTimeout(timeout)
					resolve(null)
					return
				}

				const credentials = await client.getStoredCredentials()
				if (credentials) {
					clearInterval(checkInterval)
					clearTimeout(timeout)
					resolve({
						access_token: credentials.accessToken,
						token_type: credentials.tokenType,
						refresh_token: credentials.refreshToken,
						scope: credentials.scope,
						expires_in: credentials.expiresAt
							? Math.floor((credentials.expiresAt - Date.now()) / 1000)
							: undefined,
					})
				}
			}, 1000) // Check every second
		})
	}

	/**
	 * Register URI handler for OAuth callbacks
	 */
	private registerOAuthCallbackHandler(): void {
		vscode.window.registerUriHandler({
			handleUri: async (uri: vscode.Uri) => {
				if (uri.path === "/oauth-callback") {
					await this.handleOAuthCallback(uri)
				}
			},
		})
	}

	/**
	 * Handle OAuth callback from browser
	 * @param uri Callback URI with authorization code
	 */
	private async handleOAuthCallback(uri: vscode.Uri): Promise<void> {
		try {
			// Parse query parameters
			const params = new URLSearchParams(uri.query)
			const code = params.get("code")
			const state = params.get("state")
			const error = params.get("error")
			const errorDescription = params.get("error_description")

			if (error) {
				vscode.window.showErrorMessage(`OAuth authorization failed: ${error} - ${errorDescription || ""}`)
				return
			}

			if (!code || !state) {
				vscode.window.showErrorMessage("Invalid OAuth callback: missing code or state")
				return
			}

			// Find the client that initiated this flow
			// We need to validate state to determine which server this is for
			let targetClient: OAuthClient | null = null
			let targetServerName: string | null = null

			for (const [serverName, client] of this.oauthClients) {
				if (await client.validateState(state)) {
					targetClient = client
					targetServerName = serverName
					break
				}
			}

			if (!targetClient || !targetServerName) {
				vscode.window.showErrorMessage("OAuth callback received for unknown session")
				return
			}

			// Get stored PKCE verifier
			const pkce = await targetClient.getStoredPKCEVerifier()
			if (!pkce) {
				vscode.window.showErrorMessage("OAuth callback received but PKCE verifier not found")
				return
			}

			// Get client registration
			const clientRegistration = await targetClient.getStoredClientRegistration()
			if (!clientRegistration) {
				vscode.window.showErrorMessage("OAuth callback received but client registration not found")
				return
			}

			// Get authorization server metadata
			const credentials = await targetClient.getStoredCredentials()
			const resourceUrl = credentials?.serverUrl || ""
			const authServerUrl = await this.getAuthServerUrl(resourceUrl)

			if (!authServerUrl) {
				vscode.window.showErrorMessage("Cannot determine authorization server URL")
				return
			}

			const authMetadata = await targetClient.discoverAuthorizationServerMetadata(authServerUrl)

			// Exchange code for tokens
			vscode.window.showInformationMessage(`Completing OAuth authorization for ${targetServerName}...`)

			const tokens = await targetClient.exchangeCodeForTokens(
				authMetadata,
				code,
				clientRegistration.client_id,
				clientRegistration.client_secret,
				pkce,
				resourceUrl,
			)

			vscode.window.showInformationMessage(`Successfully authorized MCP server "${targetServerName}"`)
		} catch (error) {
			console.error("OAuth callback handling failed:", error)
			vscode.window.showErrorMessage(
				`Failed to complete OAuth authorization: ${error instanceof Error ? error.message : String(error)}`,
			)
		}
	}

	/**
	 * Clear OAuth credentials for a server
	 * @param serverName Server name
	 */
	public async clearServerCredentials(serverName: string): Promise<void> {
		const client = this.oauthClients.get(serverName)
		if (client) {
			await client.clearCredentials()
			this.oauthClients.delete(serverName)
		}
	}

	/**
	 * Dispose of OAuth manager
	 */
	public dispose(): void {
		this.oauthClients.clear()
		this.authorizationInProgress.clear()
	}
}
