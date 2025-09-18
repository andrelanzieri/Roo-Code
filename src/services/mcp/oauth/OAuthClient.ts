/**
 * OAuth 2.1 Client for MCP Server Authentication
 * Implements Authorization Code + PKCE flow per OAuth 2.1 specification
 */

import * as crypto from "crypto"
import * as vscode from "vscode"
import {
	AuthorizationServerMetadata,
	ClientRegistrationRequest,
	ClientRegistrationResponse,
	OAuthConfig,
	OAuthError,
	PKCEChallenge,
	ProtectedResourceMetadata,
	StoredOAuthCredentials,
	TokenResponse,
	WWWAuthenticateChallenge,
} from "./types"

export class OAuthClient {
	private static readonly PKCE_VERIFIER_LENGTH = 128
	private static readonly TOKEN_REFRESH_BUFFER_MS = 30 * 1000 // 30 seconds buffer

	constructor(
		private readonly serverName: string,
		private readonly resourceUrl: string,
		private readonly context: vscode.ExtensionContext,
	) {}

	/**
	 * Parse WWW-Authenticate header to extract OAuth challenge information
	 * @param header The WWW-Authenticate header value
	 * @returns Parsed challenge information
	 */
	public parseWWWAuthenticate(header: string): WWWAuthenticateChallenge {
		const result: WWWAuthenticateChallenge = { scheme: "" }

		// Match the scheme (e.g., "Bearer", "Basic", etc.)
		const schemeMatch = header.match(/^(\w+)\s+/)
		if (!schemeMatch) {
			throw new Error("Invalid WWW-Authenticate header format")
		}
		result.scheme = schemeMatch[1]

		// Parse parameters
		const paramsString = header.substring(schemeMatch[0].length)
		const paramRegex = /(\w+)="([^"]+)"/g
		let match: RegExpExecArray | null

		while ((match = paramRegex.exec(paramsString)) !== null) {
			const [, key, value] = match
			switch (key) {
				case "realm":
					result.realm = value
					break
				case "scope":
					result.scope = value
					break
				case "error":
					result.error = value
					break
				case "error_description":
					result.error_description = value
					break
				case "error_uri":
					result.error_uri = value
					break
				case "resource":
					result.resource = value
					break
				case "as_uri":
					result.as_uri = value
					break
			}
		}

		return result
	}

	/**
	 * Discover OAuth Protected Resource Metadata (RFC 9728)
	 * @param resourceUrl The resource server URL
	 * @returns Protected resource metadata
	 */
	public async discoverResourceMetadata(resourceUrl: string): Promise<ProtectedResourceMetadata> {
		const metadataUrl = new URL("/.well-known/oauth-protected-resource", resourceUrl).toString()

		const response = await fetch(metadataUrl, {
			method: "GET",
			headers: {
				Accept: "application/json",
			},
		})

		if (!response.ok) {
			throw new Error(`Failed to fetch resource metadata: ${response.status} ${response.statusText}`)
		}

		const metadata = (await response.json()) as ProtectedResourceMetadata

		// Validate required fields
		if (!metadata.resource || !metadata.authorization_servers || metadata.authorization_servers.length === 0) {
			throw new Error("Invalid resource metadata: missing required fields")
		}

		return metadata
	}

	/**
	 * Discover Authorization Server Metadata (RFC 8414 + OIDC Discovery)
	 * Attempts discovery in the specified order per requirements
	 * @param issuer The authorization server issuer URL
	 * @returns Authorization server metadata
	 */
	public async discoverAuthorizationServerMetadata(issuer: string): Promise<AuthorizationServerMetadata> {
		const issuerUrl = new URL(issuer)
		const hasPath = issuerUrl.pathname !== "/" && issuerUrl.pathname !== ""

		const discoveryUrls: string[] = []

		if (hasPath) {
			// Issuer with path component
			const pathComponent = issuerUrl.pathname.replace(/^\//, "").replace(/\/$/, "")
			discoveryUrls.push(
				new URL(`/.well-known/oauth-authorization-server/${pathComponent}`, issuerUrl.origin).toString(),
				new URL(`/.well-known/openid-configuration/${pathComponent}`, issuerUrl.origin).toString(),
				new URL(`${issuerUrl.pathname}/.well-known/openid-configuration`, issuerUrl.origin).toString(),
			)
		} else {
			// Issuer without path component
			discoveryUrls.push(
				new URL("/.well-known/oauth-authorization-server", issuerUrl.origin).toString(),
				new URL("/.well-known/openid-configuration", issuerUrl.origin).toString(),
			)
		}

		// Try each discovery URL in order
		let lastError: Error | null = null
		for (const url of discoveryUrls) {
			try {
				const response = await fetch(url, {
					method: "GET",
					headers: {
						Accept: "application/json",
					},
				})

				if (response.ok) {
					const metadata = (await response.json()) as AuthorizationServerMetadata

					// Validate required fields
					if (!metadata.issuer || !metadata.authorization_endpoint || !metadata.token_endpoint) {
						continue // Try next URL
					}

					// Validate PKCE support
					if (!this.validatePKCESupport(metadata)) {
						throw new Error(
							"Authorization server does not support PKCE with S256 method, which is required by OAuth 2.1",
						)
					}

					return metadata
				}
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error))
				// Continue to next URL
			}
		}

		throw lastError || new Error("Failed to discover authorization server metadata")
	}

	/**
	 * Validate PKCE support in authorization server metadata
	 * @param metadata Authorization server metadata
	 * @returns true if PKCE S256 is supported
	 */
	private validatePKCESupport(metadata: AuthorizationServerMetadata): boolean {
		// For RFC 8414: if code_challenge_methods_supported is absent, refuse
		// For OIDC Discovery: verify code_challenge_methods_supported present, if absent refuse
		if (!metadata.code_challenge_methods_supported) {
			return false
		}

		// Check if S256 is supported
		return metadata.code_challenge_methods_supported.includes("S256")
	}

	/**
	 * Perform Dynamic Client Registration (RFC 7591)
	 * @param metadata Authorization server metadata
	 * @returns Client registration response
	 */
	public async registerClient(metadata: AuthorizationServerMetadata): Promise<ClientRegistrationResponse> {
		if (!metadata.registration_endpoint) {
			throw new Error("Authorization server does not support dynamic client registration")
		}

		// Determine redirect URI based on environment
		const redirectUri = this.getRedirectUri()

		const registrationRequest: ClientRegistrationRequest = {
			client_name: `Roo Code MCP Client - ${this.serverName}`,
			redirect_uris: [redirectUri],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none", // Public client
			scope: "openid profile", // Request basic OIDC scopes if available
			software_id: "roo-code-mcp-client",
			software_version: this.context.extension.packageJSON.version,
		}

		const response = await fetch(metadata.registration_endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(registrationRequest),
		})

		if (!response.ok) {
			const error = await response.json()
			throw new Error(
				`Client registration failed: ${error.error || response.status} - ${
					error.error_description || response.statusText
				}`,
			)
		}

		const registration = (await response.json()) as ClientRegistrationResponse

		// Store client credentials
		await this.storeClientCredentials(registration)

		return registration
	}

	/**
	 * Generate PKCE challenge for authorization request
	 * @returns PKCE challenge parameters
	 */
	public generatePKCEChallenge(): PKCEChallenge {
		// Generate code verifier (128 characters from unreserved characters)
		const verifier = crypto
			.randomBytes(OAuthClient.PKCE_VERIFIER_LENGTH)
			.toString("base64url")
			.substring(0, OAuthClient.PKCE_VERIFIER_LENGTH)

		// Generate code challenge using S256 method
		const challenge = crypto.createHash("sha256").update(verifier).digest("base64url")

		return {
			code_verifier: verifier,
			code_challenge: challenge,
			code_challenge_method: "S256",
		}
	}

	/**
	 * Build authorization URL for user consent
	 * @param metadata Authorization server metadata
	 * @param clientId Client ID
	 * @param pkce PKCE challenge
	 * @param resource Resource indicator (RFC 8707)
	 * @param scope Optional scope
	 * @returns Authorization URL
	 */
	public buildAuthorizationUrl(
		metadata: AuthorizationServerMetadata,
		clientId: string,
		pkce: PKCEChallenge,
		resource: string,
		scope?: string,
	): string {
		const redirectUri = this.getRedirectUri()
		const state = crypto.randomBytes(32).toString("base64url")

		// Store state for validation
		this.context.globalState.update(`oauth_state_${this.serverName}`, state)

		const params = new URLSearchParams({
			response_type: "code",
			client_id: clientId,
			redirect_uri: redirectUri,
			state,
			code_challenge: pkce.code_challenge,
			code_challenge_method: pkce.code_challenge_method,
			resource, // RFC 8707 - Resource Indicators
		})

		if (scope) {
			params.append("scope", scope)
		}

		return `${metadata.authorization_endpoint}?${params.toString()}`
	}

	/**
	 * Exchange authorization code for tokens
	 * @param metadata Authorization server metadata
	 * @param code Authorization code
	 * @param clientId Client ID
	 * @param clientSecret Optional client secret
	 * @param pkce PKCE verifier
	 * @param resource Resource indicator
	 * @returns Token response
	 */
	public async exchangeCodeForTokens(
		metadata: AuthorizationServerMetadata,
		code: string,
		clientId: string,
		clientSecret: string | undefined,
		pkce: PKCEChallenge,
		resource: string,
	): Promise<TokenResponse> {
		const redirectUri = this.getRedirectUri()

		const params = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: clientId,
			code_verifier: pkce.code_verifier,
			resource, // RFC 8707 - Include resource in token request
		})

		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		}

		// Add client authentication if confidential client
		if (clientSecret) {
			const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
			headers["Authorization"] = `Basic ${auth}`
		}

		const response = await fetch(metadata.token_endpoint, {
			method: "POST",
			headers,
			body: params.toString(),
		})

		if (!response.ok) {
			const error = (await response.json()) as OAuthError
			throw new Error(`Token exchange failed: ${error.error} - ${error.error_description || ""}`)
		}

		const tokens = (await response.json()) as TokenResponse

		// Store tokens
		await this.storeTokens(tokens, clientId, clientSecret)

		return tokens
	}

	/**
	 * Refresh access token using refresh token
	 * @param metadata Authorization server metadata
	 * @param refreshToken Refresh token
	 * @param clientId Client ID
	 * @param clientSecret Optional client secret
	 * @param resource Resource indicator
	 * @returns New token response
	 */
	public async refreshAccessToken(
		metadata: AuthorizationServerMetadata,
		refreshToken: string,
		clientId: string,
		clientSecret: string | undefined,
		resource: string,
	): Promise<TokenResponse> {
		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: clientId,
			resource, // RFC 8707 - Include resource in refresh request
		})

		const headers: Record<string, string> = {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		}

		// Add client authentication if confidential client
		if (clientSecret) {
			const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
			headers["Authorization"] = `Basic ${auth}`
		}

		const response = await fetch(metadata.token_endpoint, {
			method: "POST",
			headers,
			body: params.toString(),
		})

		if (!response.ok) {
			const error = (await response.json()) as OAuthError
			throw new Error(`Token refresh failed: ${error.error} - ${error.error_description || ""}`)
		}

		const tokens = (await response.json()) as TokenResponse

		// Update stored tokens
		await this.storeTokens(tokens, clientId, clientSecret)

		return tokens
	}

	/**
	 * Get stored OAuth credentials
	 * @returns Stored credentials or null
	 */
	public async getStoredCredentials(): Promise<StoredOAuthCredentials | null> {
		const key = `oauth_credentials_${this.serverName}`
		return this.context.globalState.get<StoredOAuthCredentials>(key) || null
	}

	/**
	 * Check if stored token is expired or about to expire
	 * @param credentials Stored credentials
	 * @returns true if token needs refresh
	 */
	public isTokenExpired(credentials: StoredOAuthCredentials): boolean {
		if (!credentials.expiresAt) {
			return false // No expiry information, assume valid
		}

		const now = Date.now()
		return now >= credentials.expiresAt - OAuthClient.TOKEN_REFRESH_BUFFER_MS
	}

	/**
	 * Clear stored OAuth credentials
	 */
	public async clearCredentials(): Promise<void> {
		const keys = [
			`oauth_credentials_${this.serverName}`,
			`oauth_client_${this.serverName}`,
			`oauth_state_${this.serverName}`,
			`oauth_pkce_${this.serverName}`,
		]

		for (const key of keys) {
			await this.context.globalState.update(key, undefined)
		}
	}

	/**
	 * Get redirect URI for OAuth flow
	 * @returns Redirect URI
	 */
	private getRedirectUri(): string {
		// Use VS Code's built-in URI handler for OAuth callbacks
		return `vscode://RooCodeInc.roo-code/oauth-callback`
	}

	/**
	 * Store client registration details
	 * @param registration Client registration response
	 */
	private async storeClientCredentials(registration: ClientRegistrationResponse): Promise<void> {
		const key = `oauth_client_${this.serverName}`
		await this.context.globalState.update(key, registration)
	}

	/**
	 * Store OAuth tokens
	 * @param tokens Token response
	 * @param clientId Client ID
	 * @param clientSecret Optional client secret
	 */
	private async storeTokens(
		tokens: TokenResponse,
		clientId: string,
		clientSecret: string | undefined,
	): Promise<void> {
		const credentials: StoredOAuthCredentials = {
			serverName: this.serverName,
			serverUrl: this.resourceUrl,
			clientId,
			clientSecret,
			accessToken: tokens.access_token,
			refreshToken: tokens.refresh_token,
			tokenType: tokens.token_type,
			scope: tokens.scope,
			expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
		}

		const key = `oauth_credentials_${this.serverName}`
		await this.context.globalState.update(key, credentials)
	}

	/**
	 * Get stored client registration
	 * @returns Client registration or null
	 */
	public async getStoredClientRegistration(): Promise<ClientRegistrationResponse | null> {
		const key = `oauth_client_${this.serverName}`
		return this.context.globalState.get<ClientRegistrationResponse>(key) || null
	}

	/**
	 * Validate state parameter from OAuth callback
	 * @param state State parameter from callback
	 * @returns true if state is valid
	 */
	public async validateState(state: string): Promise<boolean> {
		const key = `oauth_state_${this.serverName}`
		const storedState = await this.context.globalState.get<string>(key)

		if (!storedState || storedState !== state) {
			return false
		}

		// Clear state after validation
		await this.context.globalState.update(key, undefined)
		return true
	}

	/**
	 * Store PKCE verifier for later use
	 * @param pkce PKCE challenge
	 */
	public async storePKCEVerifier(pkce: PKCEChallenge): Promise<void> {
		const key = `oauth_pkce_${this.serverName}`
		await this.context.globalState.update(key, pkce)
	}

	/**
	 * Get stored PKCE verifier
	 * @returns PKCE challenge or null
	 */
	public async getStoredPKCEVerifier(): Promise<PKCEChallenge | null> {
		const key = `oauth_pkce_${this.serverName}`
		const pkce = await this.context.globalState.get<PKCEChallenge>(key)

		if (pkce) {
			// Clear PKCE after retrieval for security
			await this.context.globalState.update(key, undefined)
		}

		return pkce || null
	}
}
