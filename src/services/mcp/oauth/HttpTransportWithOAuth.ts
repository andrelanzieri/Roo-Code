/**
 * HTTP Transport wrapper with OAuth 2.1 support
 * Intercepts 401 responses and initiates OAuth flow when needed
 */

import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import * as vscode from "vscode"
import { OAuthManager } from "./OAuthManager"

export class HttpTransportWithOAuth {
	private oauthManager: OAuthManager
	private accessToken: string | null = null
	private serverName: string
	private resourceUrl: string

	constructor(
		private transport: SSEClientTransport | StreamableHTTPClientTransport,
		serverName: string,
		resourceUrl: string,
		context: vscode.ExtensionContext,
	) {
		this.serverName = serverName
		this.resourceUrl = resourceUrl
		this.oauthManager = new OAuthManager(context)
		this.wrapTransportMethods()
	}

	/**
	 * Wrap transport methods to intercept 401 responses
	 */
	private wrapTransportMethods(): void {
		// Store original fetch method if using custom fetch
		const originalFetch = (global as any).fetch || fetch

		// Override global fetch to intercept responses
		const interceptedFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
			// Add OAuth token if available
			const headers = new Headers(init?.headers || {})

			// Check if we have an access token
			if (!this.accessToken) {
				this.accessToken = await this.oauthManager.getAccessToken(this.serverName)
			}

			if (this.accessToken) {
				headers.set("Authorization", `Bearer ${this.accessToken}`)
			}

			// Make the request
			const response = await originalFetch(url, {
				...init,
				headers,
			})

			// Check for 401 Unauthorized
			if (response.status === 401) {
				const wwwAuthenticate = response.headers.get("WWW-Authenticate")

				if (wwwAuthenticate) {
					// Attempt OAuth flow
					const newToken = await this.oauthManager.handle401Response(
						this.serverName,
						this.resourceUrl,
						wwwAuthenticate,
					)

					if (newToken) {
						// Update our token
						this.accessToken = newToken

						// Retry the request with new token
						const retryHeaders = new Headers(init?.headers || {})
						retryHeaders.set("Authorization", `Bearer ${newToken}`)

						return await originalFetch(url, {
							...init,
							headers: retryHeaders,
						})
					}
				}
			}

			return response
		}

		// Replace global fetch for this transport
		;(global as any).fetch = interceptedFetch
	}

	/**
	 * Get the wrapped transport
	 */
	public getTransport(): SSEClientTransport | StreamableHTTPClientTransport {
		return this.transport
	}

	/**
	 * Clear OAuth credentials for this server
	 */
	public async clearCredentials(): Promise<void> {
		await this.oauthManager.clearServerCredentials(this.serverName)
		this.accessToken = null
	}

	/**
	 * Dispose of OAuth manager
	 */
	public dispose(): void {
		this.oauthManager.dispose()
	}
}

/**
 * Create an SSE transport with OAuth support
 */
export function createSSETransportWithOAuth(
	url: URL,
	options: any,
	serverName: string,
	context: vscode.ExtensionContext,
): SSEClientTransport {
	const transport = new SSEClientTransport(url, options)
	const wrapper = new HttpTransportWithOAuth(transport, serverName, url.toString(), context)
	return transport // Return the original transport, which has been enhanced with OAuth
}

/**
 * Create a StreamableHTTP transport with OAuth support
 */
export function createStreamableHTTPTransportWithOAuth(
	url: URL,
	options: any,
	serverName: string,
	context: vscode.ExtensionContext,
): StreamableHTTPClientTransport {
	const transport = new StreamableHTTPClientTransport(url, options)
	const wrapper = new HttpTransportWithOAuth(transport, serverName, url.toString(), context)
	return transport // Return the original transport, which has been enhanced with OAuth
}
