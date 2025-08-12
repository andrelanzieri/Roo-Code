import * as crypto from "crypto"
import * as vscode from "vscode"
import { CHATGPT_OAUTH_CONFIG, type OAuthState } from "@roo-code/types"

/**
 * Generate a cryptographically secure random string for OAuth state
 */
export function generateState(): string {
	return crypto.randomBytes(32).toString("base64url")
}

/**
 * Generate PKCE code verifier and challenge
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
	// Generate a random code verifier (43-128 characters)
	const codeVerifier = crypto.randomBytes(32).toString("base64url")

	// Generate the code challenge using SHA256
	const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url")

	return { codeVerifier, codeChallenge }
}

/**
 * Build the OAuth authorization URL
 */
export function buildAuthorizationUrl(
	state: string,
	codeChallenge: string,
	port: number = CHATGPT_OAUTH_CONFIG.defaultPort,
): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: CHATGPT_OAUTH_CONFIG.clientId,
		redirect_uri: `http://localhost:${port}/auth/callback`,
		scope: CHATGPT_OAUTH_CONFIG.scopes.join(" "),
		state,
		code_challenge: codeChallenge,
		code_challenge_method: "S256",
		id_token_add_organizations: "true",
		codex_cli_simplified_flow: "true", // For Codex CLI compatibility
	})

	return `${CHATGPT_OAUTH_CONFIG.authorizationUrl}?${params.toString()}`
}

/**
 * Store OAuth state for CSRF protection
 */
export async function storeOAuthState(context: vscode.ExtensionContext, state: OAuthState): Promise<void> {
	await context.globalState.update("roo.openai.oauth.state", state)
}

/**
 * Retrieve and validate OAuth state
 */
export async function validateOAuthState(
	context: vscode.ExtensionContext,
	receivedState: string,
): Promise<OAuthState | null> {
	const storedState = context.globalState.get<OAuthState>("roo.openai.oauth.state")

	if (!storedState) {
		return null
	}

	// Check if state matches
	if (storedState.state !== receivedState) {
		return null
	}

	// Check if state is not expired (5 minutes timeout)
	const now = Date.now()
	if (now - storedState.timestamp > 5 * 60 * 1000) {
		await context.globalState.update("roo.openai.oauth.state", undefined)
		return null
	}

	// Clear the state after validation
	await context.globalState.update("roo.openai.oauth.state", undefined)

	return storedState
}

/**
 * Find an available port for the OAuth callback server
 */
export async function findAvailablePort(preferredPort: number = CHATGPT_OAUTH_CONFIG.defaultPort): Promise<number> {
	const net = await import("net")

	return new Promise((resolve) => {
		const server = net.createServer()

		server.listen(preferredPort, "127.0.0.1", () => {
			const port = (server.address() as any).port
			server.close(() => resolve(port))
		})

		server.on("error", () => {
			// If preferred port is busy, let the OS assign a random port
			server.listen(0, "127.0.0.1", () => {
				const port = (server.address() as any).port
				server.close(() => resolve(port))
			})
		})
	})
}

/**
 * Parse JWT token to extract claims (without verification)
 */
export function parseJWT(token: string): any {
	try {
		const parts = token.split(".")
		if (parts.length !== 3) {
			return null
		}

		const payload = parts[1]
		const decoded = Buffer.from(payload, "base64url").toString("utf-8")
		return JSON.parse(decoded)
	} catch {
		return null
	}
}

/**
 * Check if a token is expired or about to expire
 */
export function isTokenExpired(token: string, bufferSeconds: number = 300): boolean {
	const claims = parseJWT(token)
	if (!claims || !claims.exp) {
		return true
	}

	const now = Math.floor(Date.now() / 1000)
	return claims.exp - bufferSeconds <= now
}

/**
 * Format error message for user display
 */
export function formatOAuthError(error: any): string {
	if (typeof error === "string") {
		return error
	}

	if (error?.error_description) {
		return error.error_description
	}

	if (error?.error) {
		return `OAuth error: ${error.error}`
	}

	if (error?.message) {
		return error.message
	}

	return "An unknown error occurred during authentication"
}
