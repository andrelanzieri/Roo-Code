import * as vscode from "vscode"
import * as http from "http"
import * as crypto from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import { URL } from "url"
import pkceChallenge from "pkce-challenge"

export interface OAuthConfig {
	clientId: string
	clientSecret?: string
	authorizationUrl: string
	tokenUrl: string
	redirectUri?: string
	scopes?: string[]
	additionalParams?: Record<string, string>
}

export interface OAuthTokens {
	accessToken: string
	refreshToken?: string
	expiresAt?: number
	tokenType?: string
	scope?: string
}

interface StoredOAuthData {
	tokens: OAuthTokens
	serverName: string
	timestamp: number
}

export class OAuthHandler {
	private static instance: OAuthHandler | null = null
	private server: http.Server | null = null
	private pendingAuthorizations: Map<string, (tokens: OAuthTokens | null) => void> = new Map()
	private tokenStorage: Map<string, StoredOAuthData> = new Map()
	private storageFilePath: string

	private constructor(private context: vscode.ExtensionContext) {
		// Initialize storage file path
		this.storageFilePath = path.join(context.globalStorageUri.fsPath, "mcp-oauth-tokens.json")
		this.loadStoredTokens()
	}

	public static getInstance(context: vscode.ExtensionContext): OAuthHandler {
		if (!OAuthHandler.instance) {
			OAuthHandler.instance = new OAuthHandler(context)
		}
		return OAuthHandler.instance
	}

	/**
	 * Load stored OAuth tokens from disk
	 */
	private async loadStoredTokens(): Promise<void> {
		try {
			const data = await fs.readFile(this.storageFilePath, "utf-8")
			const parsed = JSON.parse(data) as Record<string, StoredOAuthData>
			this.tokenStorage = new Map(Object.entries(parsed))
		} catch (error) {
			// File doesn't exist or is invalid, start with empty storage
			this.tokenStorage = new Map()
		}
	}

	/**
	 * Save OAuth tokens to disk
	 */
	private async saveStoredTokens(): Promise<void> {
		try {
			const data = Object.fromEntries(this.tokenStorage)
			await fs.mkdir(path.dirname(this.storageFilePath), { recursive: true })
			await fs.writeFile(this.storageFilePath, JSON.stringify(data, null, 2))
		} catch (error) {
			console.error("Failed to save OAuth tokens:", error)
		}
	}

	/**
	 * Get stored tokens for a server
	 */
	public async getStoredTokens(serverName: string): Promise<OAuthTokens | null> {
		const stored = this.tokenStorage.get(serverName)
		if (!stored) {
			return null
		}

		// Check if token is expired
		if (stored.tokens.expiresAt && stored.tokens.expiresAt < Date.now()) {
			// Token is expired, remove it
			this.tokenStorage.delete(serverName)
			await this.saveStoredTokens()
			return null
		}

		return stored.tokens
	}

	/**
	 * Store tokens for a server
	 */
	private async storeTokens(serverName: string, tokens: OAuthTokens): Promise<void> {
		this.tokenStorage.set(serverName, {
			tokens,
			serverName,
			timestamp: Date.now(),
		})
		await this.saveStoredTokens()
	}

	/**
	 * Clear stored tokens for a server
	 */
	public async clearTokens(serverName: string): Promise<void> {
		this.tokenStorage.delete(serverName)
		await this.saveStoredTokens()
	}

	/**
	 * Start the OAuth flow for a server
	 */
	public async authenticate(serverName: string, config: OAuthConfig): Promise<OAuthTokens | null> {
		// Check if we have valid stored tokens
		const storedTokens = await this.getStoredTokens(serverName)
		if (storedTokens) {
			return storedTokens
		}

		// Start OAuth flow
		return new Promise<OAuthTokens | null>((resolve) => {
			this.startOAuthFlow(serverName, config, resolve)
		})
	}

	private async startOAuthFlow(
		serverName: string,
		config: OAuthConfig,
		resolve: (tokens: OAuthTokens | null) => void,
	): Promise<void> {
		try {
			// Generate PKCE challenge
			const pkce = await pkceChallenge()
			const state = crypto.randomBytes(16).toString("hex")

			// Start local server if not already running
			if (!this.server) {
				await this.startCallbackServer()
			}

			// Store the pending authorization
			const authKey = `${serverName}-${state}`
			this.pendingAuthorizations.set(authKey, async (tokens) => {
				if (tokens) {
					await this.storeTokens(serverName, tokens)
				}
				resolve(tokens)
			})

			// Build authorization URL
			const authUrl = new URL(config.authorizationUrl)
			authUrl.searchParams.set("client_id", config.clientId)
			authUrl.searchParams.set("response_type", "code")
			authUrl.searchParams.set("redirect_uri", config.redirectUri || "http://localhost:3000/callback")
			authUrl.searchParams.set("state", state)
			authUrl.searchParams.set("code_challenge", pkce.code_challenge)
			authUrl.searchParams.set("code_challenge_method", "S256")

			if (config.scopes && config.scopes.length > 0) {
				authUrl.searchParams.set("scope", config.scopes.join(" "))
			}

			// Add any additional parameters
			if (config.additionalParams) {
				for (const [key, value] of Object.entries(config.additionalParams)) {
					authUrl.searchParams.set(key, value)
				}
			}

			// Store config for token exchange
			this.storePendingConfig(authKey, config, pkce.code_verifier)

			// Open the authorization URL in the browser
			const opened = await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()))
			if (!opened) {
				throw new Error("Failed to open authorization URL in browser")
			}

			// Show information message
			vscode.window.showInformationMessage(
				`Opening browser for OAuth authentication for ${serverName}. Please complete the authorization flow.`,
			)

			// Set a timeout for the authorization
			setTimeout(
				() => {
					if (this.pendingAuthorizations.has(authKey)) {
						this.pendingAuthorizations.delete(authKey)
						this.clearPendingConfig(authKey)
						resolve(null)
						vscode.window.showErrorMessage(`OAuth authentication timeout for ${serverName}`)
					}
				},
				5 * 60 * 1000,
			) // 5 minutes timeout
		} catch (error) {
			console.error("OAuth authentication error:", error)
			vscode.window.showErrorMessage(`OAuth authentication failed: ${error}`)
			resolve(null)
		}
	}

	/**
	 * Start the local callback server
	 */
	private async startCallbackServer(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer(async (req, res) => {
				const url = new URL(req.url || "", `http://${req.headers.host}`)

				if (url.pathname === "/callback") {
					await this.handleCallback(url, res)
				} else {
					res.writeHead(404)
					res.end("Not found")
				}
			})

			this.server.listen(3000, "localhost", () => {
				console.log("OAuth callback server listening on http://localhost:3000")
				resolve()
			})

			this.server.on("error", (error) => {
				console.error("OAuth callback server error:", error)
				reject(error)
			})
		})
	}

	/**
	 * Handle OAuth callback
	 */
	private async handleCallback(url: URL, res: http.ServerResponse): Promise<void> {
		const code = url.searchParams.get("code")
		const state = url.searchParams.get("state")
		const error = url.searchParams.get("error")

		if (error) {
			res.writeHead(200, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Authentication Failed</h1>
						<p>Error: ${error}</p>
						<p>You can close this window.</p>
					</body>
				</html>
			`)
			return
		}

		if (!code || !state) {
			res.writeHead(400, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Invalid Request</h1>
						<p>Missing authorization code or state.</p>
					</body>
				</html>
			`)
			return
		}

		// Find the pending authorization
		let authKey: string | null = null
		for (const key of this.pendingAuthorizations.keys()) {
			if (key.endsWith(`-${state}`)) {
				authKey = key
				break
			}
		}

		if (!authKey) {
			res.writeHead(400, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Invalid State</h1>
						<p>The authorization state is invalid or expired.</p>
					</body>
				</html>
			`)
			return
		}

		const callback = this.pendingAuthorizations.get(authKey)
		const config = this.getPendingConfig(authKey)

		if (!callback || !config) {
			res.writeHead(400, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Configuration Error</h1>
						<p>Missing configuration for this authorization.</p>
					</body>
				</html>
			`)
			return
		}

		try {
			// Exchange code for tokens
			const tokens = await this.exchangeCodeForTokens(code, config)

			// Send success response
			res.writeHead(200, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Authentication Successful!</h1>
						<p>You can close this window and return to VS Code.</p>
						<script>window.close();</script>
					</body>
				</html>
			`)

			// Clean up and call callback
			this.pendingAuthorizations.delete(authKey)
			this.clearPendingConfig(authKey)
			callback(tokens)
		} catch (error) {
			console.error("Token exchange error:", error)
			res.writeHead(500, { "Content-Type": "text/html" })
			res.end(`
				<html>
					<body>
						<h1>Token Exchange Failed</h1>
						<p>Error: ${error}</p>
					</body>
				</html>
			`)

			// Clean up and call callback with null
			this.pendingAuthorizations.delete(authKey)
			this.clearPendingConfig(authKey)
			callback(null)
		}
	}

	/**
	 * Exchange authorization code for tokens
	 */
	private async exchangeCodeForTokens(
		code: string,
		config: { oauth: OAuthConfig; codeVerifier: string },
	): Promise<OAuthTokens> {
		const params = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: config.oauth.redirectUri || "http://localhost:3000/callback",
			client_id: config.oauth.clientId,
			code_verifier: config.codeVerifier,
		})

		if (config.oauth.clientSecret) {
			params.set("client_secret", config.oauth.clientSecret)
		}

		const response = await fetch(config.oauth.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: params.toString(),
		})

		if (!response.ok) {
			const error = await response.text()
			throw new Error(`Token exchange failed: ${response.status} - ${error}`)
		}

		const data = await response.json()

		// Calculate expiration time if expires_in is provided
		let expiresAt: number | undefined
		if (data.expires_in) {
			expiresAt = Date.now() + data.expires_in * 1000
		}

		return {
			accessToken: data.access_token,
			refreshToken: data.refresh_token,
			expiresAt,
			tokenType: data.token_type,
			scope: data.scope,
		}
	}

	/**
	 * Refresh an access token
	 */
	public async refreshToken(
		serverName: string,
		config: OAuthConfig,
		refreshToken: string,
	): Promise<OAuthTokens | null> {
		try {
			const params = new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: config.clientId,
			})

			if (config.clientSecret) {
				params.set("client_secret", config.clientSecret)
			}

			const response = await fetch(config.tokenUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: params.toString(),
			})

			if (!response.ok) {
				// Refresh failed, clear stored tokens
				await this.clearTokens(serverName)
				return null
			}

			const data = await response.json()

			// Calculate expiration time if expires_in is provided
			let expiresAt: number | undefined
			if (data.expires_in) {
				expiresAt = Date.now() + data.expires_in * 1000
			}

			const tokens: OAuthTokens = {
				accessToken: data.access_token,
				refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided, otherwise keep the old one
				expiresAt,
				tokenType: data.token_type,
				scope: data.scope,
			}

			// Store the new tokens
			await this.storeTokens(serverName, tokens)

			return tokens
		} catch (error) {
			console.error("Token refresh error:", error)
			await this.clearTokens(serverName)
			return null
		}
	}

	// Temporary storage for pending OAuth configs
	private pendingConfigs: Map<string, { oauth: OAuthConfig; codeVerifier: string }> = new Map()

	private storePendingConfig(authKey: string, config: OAuthConfig, codeVerifier: string): void {
		this.pendingConfigs.set(authKey, { oauth: config, codeVerifier })
	}

	private getPendingConfig(authKey: string): { oauth: OAuthConfig; codeVerifier: string } | undefined {
		return this.pendingConfigs.get(authKey)
	}

	private clearPendingConfig(authKey: string): void {
		this.pendingConfigs.delete(authKey)
	}

	/**
	 * Dispose of the OAuth handler
	 */
	public dispose(): void {
		if (this.server) {
			this.server.close()
			this.server = null
		}
		this.pendingAuthorizations.clear()
		this.pendingConfigs.clear()
	}
}
