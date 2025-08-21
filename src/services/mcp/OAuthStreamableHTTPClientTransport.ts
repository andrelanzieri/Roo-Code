import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { OAuthHandler, OAuthConfig, OAuthTokens } from "./OAuthHandler"
import * as vscode from "vscode"

export interface OAuthStreamableHTTPConfig {
	url: URL
	headers?: Record<string, string>
	oauth?: OAuthConfig
	serverName: string
	context: vscode.ExtensionContext
}

/**
 * Wrapper for StreamableHTTPClientTransport that adds OAuth authentication support
 */
export class OAuthStreamableHTTPClientTransport {
	private transport: StreamableHTTPClientTransport
	private oauthHandler: OAuthHandler | null = null
	private oauthConfig: OAuthConfig | null = null
	private serverName: string
	private tokens: OAuthTokens | null = null
	private isAuthenticating: boolean = false
	private authenticationPromise: Promise<void> | null = null
	private originalHeaders: Record<string, string>

	constructor(config: OAuthStreamableHTTPConfig) {
		this.serverName = config.serverName
		this.originalHeaders = config.headers || {}

		// If OAuth config is provided, set up OAuth handler
		if (config.oauth) {
			this.oauthConfig = config.oauth
			this.oauthHandler = OAuthHandler.getInstance(config.context)
		}

		// Create the base transport with initial headers
		this.transport = new StreamableHTTPClientTransport(config.url, {
			requestInit: {
				headers: this.originalHeaders,
			},
		})

		// Intercept the transport to add OAuth headers
		if (this.oauthConfig) {
			this.setupOAuthInterception()
		}
	}

	/**
	 * Set up OAuth interception for the transport
	 */
	private setupOAuthInterception(): void {
		// Store the original fetch function
		const originalFetch = globalThis.fetch

		// Create a custom fetch that adds OAuth headers
		const oauthFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
			// Only intercept requests to our MCP server URL
			const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url

			// Check if this is a request to our MCP server
			if (url && this.shouldInterceptRequest(url)) {
				// Ensure we have valid tokens
				await this.ensureAuthenticated()

				// Add OAuth token to headers
				if (this.tokens) {
					const headers = new Headers(init?.headers || {})
					headers.set("Authorization", `${this.tokens.tokenType || "Bearer"} ${this.tokens.accessToken}`)

					init = {
						...init,
						headers,
					}
				}

				// Make the request
				const response = await originalFetch(input, init)

				// Check if we got a 401 Unauthorized response
				if (response.status === 401) {
					// Token might be expired, try to refresh or re-authenticate
					await this.handleUnauthorized()

					// Retry the request with new token
					if (this.tokens) {
						const headers = new Headers(init?.headers || {})
						headers.set("Authorization", `${this.tokens.tokenType || "Bearer"} ${this.tokens.accessToken}`)

						const retryInit = {
							...init,
							headers,
						}

						return originalFetch(input, retryInit)
					}
				}

				return response
			}

			// Not our request, pass through
			return originalFetch(input, init)
		}

		// Replace global fetch temporarily when our transport is active
		// This is a workaround since StreamableHTTPClientTransport doesn't expose its fetch method
		const originalStart = this.transport.start.bind(this.transport)
		const originalClose = this.transport.close.bind(this.transport)

		this.transport.start = async () => {
			// Replace fetch
			globalThis.fetch = oauthFetch as typeof fetch

			// Ensure we're authenticated before starting
			if (this.oauthConfig && this.oauthHandler) {
				try {
					await this.ensureAuthenticated()
				} catch (error) {
					console.error(`OAuth authentication failed for ${this.serverName}:`, error)
					// Continue anyway - the server might not require auth for all endpoints
				}
			}

			return originalStart()
		}

		this.transport.close = async () => {
			// Restore original fetch
			globalThis.fetch = originalFetch
			return originalClose()
		}
	}

	/**
	 * Check if we should intercept this request
	 */
	private shouldInterceptRequest(url: string): boolean {
		// This is a simplified check - you might want to make this more sophisticated
		// For now, we'll intercept all requests while this transport is active
		return true
	}

	/**
	 * Ensure we have valid OAuth tokens
	 */
	private async ensureAuthenticated(): Promise<void> {
		// If already authenticating, wait for it to complete
		if (this.isAuthenticating && this.authenticationPromise) {
			await this.authenticationPromise
			return
		}

		// If we already have tokens, check if they're still valid
		if (this.tokens) {
			if (!this.tokens.expiresAt || this.tokens.expiresAt > Date.now()) {
				// Tokens are still valid
				return
			}

			// Try to refresh the token
			if (this.tokens.refreshToken && this.oauthHandler && this.oauthConfig) {
				const refreshedTokens = await this.oauthHandler.refreshToken(
					this.serverName,
					this.oauthConfig,
					this.tokens.refreshToken,
				)

				if (refreshedTokens) {
					this.tokens = refreshedTokens
					return
				}
			}
		}

		// Check for stored tokens
		if (this.oauthHandler) {
			const storedTokens = await this.oauthHandler.getStoredTokens(this.serverName)
			if (storedTokens) {
				this.tokens = storedTokens
				return
			}
		}

		// Need to authenticate
		await this.authenticate()
	}

	/**
	 * Handle 401 Unauthorized response
	 */
	private async handleUnauthorized(): Promise<void> {
		// If we have a refresh token, try to refresh
		if (this.tokens?.refreshToken && this.oauthHandler && this.oauthConfig) {
			const refreshedTokens = await this.oauthHandler.refreshToken(
				this.serverName,
				this.oauthConfig,
				this.tokens.refreshToken,
			)

			if (refreshedTokens) {
				this.tokens = refreshedTokens
				return
			}
		}

		// Clear stored tokens and re-authenticate
		if (this.oauthHandler) {
			await this.oauthHandler.clearTokens(this.serverName)
		}

		// Clear current tokens
		this.tokens = null

		await this.authenticate()
	}

	/**
	 * Perform OAuth authentication
	 */
	private async authenticate(): Promise<void> {
		if (!this.oauthHandler || !this.oauthConfig) {
			throw new Error("OAuth not configured for this transport")
		}

		// Prevent multiple simultaneous authentication attempts
		if (this.isAuthenticating) {
			if (this.authenticationPromise) {
				await this.authenticationPromise
			}
			return
		}

		this.isAuthenticating = true
		this.authenticationPromise = (async () => {
			try {
				const tokens = await this.oauthHandler!.authenticate(this.serverName, this.oauthConfig!)

				if (!tokens) {
					throw new Error("OAuth authentication failed or was cancelled")
				}

				this.tokens = tokens
			} finally {
				this.isAuthenticating = false
				this.authenticationPromise = null
			}
		})()

		await this.authenticationPromise
	}

	/**
	 * Get the underlying transport
	 */
	public getTransport(): StreamableHTTPClientTransport {
		return this.transport
	}

	/**
	 * Start the transport
	 */
	public async start(): Promise<void> {
		await this.transport.start()
	}

	/**
	 * Close the transport
	 */
	public async close(): Promise<void> {
		await this.transport.close()
	}

	/**
	 * Check if OAuth is configured for this transport
	 */
	public hasOAuth(): boolean {
		return this.oauthConfig !== null
	}

	/**
	 * Get the current OAuth tokens (if any)
	 */
	public getTokens(): OAuthTokens | null {
		return this.tokens
	}

	/**
	 * Clear OAuth tokens and force re-authentication on next request
	 */
	public async clearTokens(): Promise<void> {
		this.tokens = null
		if (this.oauthHandler) {
			await this.oauthHandler.clearTokens(this.serverName)
		}
	}

	// Proxy all other properties and methods to the underlying transport
	get onerror() {
		return this.transport.onerror
	}

	set onerror(handler: ((error: Error) => void) | undefined) {
		this.transport.onerror = handler
	}

	get onclose() {
		return this.transport.onclose
	}

	set onclose(handler: (() => void) | undefined) {
		this.transport.onclose = handler
	}
}
