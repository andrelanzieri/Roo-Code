import * as http from "http"
import * as url from "url"
import * as vscode from "vscode"
import axios from "axios"
import { CHATGPT_OAUTH_CONFIG, type OAuthTokens, type OAuthError } from "@roo-code/types"
import { validateOAuthState, formatOAuthError } from "./oauth-helpers"

/**
 * OAuth callback server for handling the authorization code
 */
export class OAuthCallbackServer {
	private server: http.Server | null = null
	private port: number
	private codePromise: Promise<string>
	private codeResolve!: (code: string) => void
	private codeReject!: (error: Error) => void

	constructor(port: number) {
		this.port = port
		this.codePromise = new Promise((resolve, reject) => {
			this.codeResolve = resolve
			this.codeReject = reject
		})
	}

	/**
	 * Start the OAuth callback server
	 */
	async start(context: vscode.ExtensionContext): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer(async (req, res) => {
				const parsedUrl = url.parse(req.url || "", true)

				if (parsedUrl.pathname === "/auth/callback") {
					await this.handleCallback(req, res, context)
				} else {
					res.writeHead(404)
					res.end("Not found")
				}
			})

			this.server.listen(this.port, "127.0.0.1", () => {
				resolve()
			})

			this.server.on("error", (error) => {
				reject(error)
			})
		})
	}

	/**
	 * Handle the OAuth callback
	 */
	private async handleCallback(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		context: vscode.ExtensionContext,
	): Promise<void> {
		const parsedUrl = url.parse(req.url || "", true)
		const { code, state, error, error_description } = parsedUrl.query

		// Handle error response
		if (error) {
			const errorMessage = formatOAuthError({ error, error_description })
			this.sendErrorResponse(res, errorMessage)
			this.codeReject(new Error(errorMessage))
			return
		}

		// Validate required parameters
		if (!code || typeof code !== "string" || !state || typeof state !== "string") {
			const errorMessage = "Missing authorization code or state"
			this.sendErrorResponse(res, errorMessage)
			this.codeReject(new Error(errorMessage))
			return
		}

		// Validate state for CSRF protection
		const validState = await validateOAuthState(context, state)
		if (!validState) {
			const errorMessage = "Invalid or expired state parameter"
			this.sendErrorResponse(res, errorMessage)
			this.codeReject(new Error(errorMessage))
			return
		}

		// Send success response to browser
		this.sendSuccessResponse(res)

		// Resolve with the authorization code
		this.codeResolve(code)
	}

	/**
	 * Send success response to browser
	 */
	private sendSuccessResponse(res: http.ServerResponse): void {
		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Authentication Successful</title>
				<style>
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						display: flex;
						justify-content: center;
						align-items: center;
						height: 100vh;
						margin: 0;
						background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					}
					.container {
						background: white;
						padding: 40px;
						border-radius: 10px;
						box-shadow: 0 10px 40px rgba(0,0,0,0.1);
						text-align: center;
						max-width: 400px;
					}
					h1 {
						color: #2d3748;
						margin-bottom: 10px;
					}
					p {
						color: #718096;
						margin-bottom: 20px;
					}
					.checkmark {
						width: 60px;
						height: 60px;
						margin: 0 auto 20px;
						background: #48bb78;
						border-radius: 50%;
						display: flex;
						justify-content: center;
						align-items: center;
					}
					.checkmark::after {
						content: "✓";
						color: white;
						font-size: 30px;
						font-weight: bold;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="checkmark"></div>
					<h1>Authentication Successful!</h1>
					<p>You have successfully signed in with ChatGPT. You can now close this window and return to VS Code.</p>
				</div>
				<script>
					// Auto-close after 3 seconds
					setTimeout(() => window.close(), 3000);
				</script>
			</body>
			</html>
		`

		res.writeHead(200, { "Content-Type": "text/html" })
		res.end(html)
	}

	/**
	 * Send error response to browser
	 */
	private sendErrorResponse(res: http.ServerResponse, errorMessage: string): void {
		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<title>Authentication Failed</title>
				<style>
					body {
						font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
						display: flex;
						justify-content: center;
						align-items: center;
						height: 100vh;
						margin: 0;
						background: linear-gradient(135deg, #f56565 0%, #c53030 100%);
					}
					.container {
						background: white;
						padding: 40px;
						border-radius: 10px;
						box-shadow: 0 10px 40px rgba(0,0,0,0.1);
						text-align: center;
						max-width: 400px;
					}
					h1 {
						color: #2d3748;
						margin-bottom: 10px;
					}
					p {
						color: #718096;
						margin-bottom: 20px;
					}
					.error-icon {
						width: 60px;
						height: 60px;
						margin: 0 auto 20px;
						background: #f56565;
						border-radius: 50%;
						display: flex;
						justify-content: center;
						align-items: center;
					}
					.error-icon::after {
						content: "✕";
						color: white;
						font-size: 30px;
						font-weight: bold;
					}
					.error-message {
						background: #fff5f5;
						border: 1px solid #feb2b2;
						border-radius: 5px;
						padding: 10px;
						color: #c53030;
						margin-top: 20px;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<div class="error-icon"></div>
					<h1>Authentication Failed</h1>
					<p>There was an error during authentication. Please try again.</p>
					<div class="error-message">${errorMessage}</div>
				</div>
			</body>
			</html>
		`

		res.writeHead(400, { "Content-Type": "text/html" })
		res.end(html)
	}

	/**
	 * Wait for the authorization code
	 */
	async waitForCode(): Promise<string> {
		return this.codePromise
	}

	/**
	 * Stop the server
	 */
	stop(): void {
		if (this.server) {
			this.server.close()
			this.server = null
		}
	}
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
	code: string,
	codeVerifier: string,
	port: number = CHATGPT_OAUTH_CONFIG.defaultPort,
): Promise<OAuthTokens> {
	try {
		const response = await axios.post(
			CHATGPT_OAUTH_CONFIG.tokenUrl,
			new URLSearchParams({
				grant_type: "authorization_code",
				code,
				redirect_uri: `http://localhost:${port}/auth/callback`,
				client_id: CHATGPT_OAUTH_CONFIG.clientId,
				code_verifier: codeVerifier,
			}),
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		)

		const { access_token, id_token, refresh_token, expires_in, token_type } = response.data

		if (!id_token || !refresh_token) {
			throw new Error("Missing required tokens in response")
		}

		return {
			accessToken: access_token,
			idToken: id_token,
			refreshToken: refresh_token,
			expiresIn: expires_in,
			tokenType: token_type,
		}
	} catch (error: any) {
		if (error.response?.data) {
			throw new Error(formatOAuthError(error.response.data))
		}
		throw error
	}
}

/**
 * Refresh tokens using refresh token
 */
export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
	try {
		const response = await axios.post(
			CHATGPT_OAUTH_CONFIG.tokenUrl,
			new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: CHATGPT_OAUTH_CONFIG.clientId,
			}),
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		)

		const { access_token, id_token, refresh_token, expires_in, token_type } = response.data

		if (!id_token) {
			throw new Error("Missing ID token in refresh response")
		}

		return {
			accessToken: access_token,
			idToken: id_token,
			refreshToken: refresh_token || refreshToken, // Use new refresh token if provided
			expiresIn: expires_in,
			tokenType: token_type,
		}
	} catch (error: any) {
		if (error.response?.data) {
			throw new Error(formatOAuthError(error.response.data))
		}
		throw error
	}
}
