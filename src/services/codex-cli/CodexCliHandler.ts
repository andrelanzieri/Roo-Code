import { spawn } from "child_process"
import * as vscode from "vscode"

/**
 * Handler for Codex CLI authentication operations
 * Based on the ChatMock reference implementation
 */
export class CodexCliHandler {
	constructor(private cliPath: string = "codex") {}

	/**
	 * Detect if the CLI is available
	 */
	async detect(): Promise<boolean> {
		return new Promise((resolve) => {
			const process = spawn(this.cliPath, ["--version"], {
				shell: true,
				windowsHide: true,
			})

			process.on("error", () => {
				resolve(false)
			})

			process.on("exit", (code) => {
				resolve(code === 0)
			})

			// Timeout after 5 seconds
			setTimeout(() => {
				process.kill()
				resolve(false)
			}, 5000)
		})
	}

	/**
	 * Run the sign-in flow to obtain a bearer token
	 */
	async signIn(): Promise<string | null> {
		return new Promise((resolve, reject) => {
			// Run the CLI auth command
			const process = spawn(this.cliPath, ["auth", "login", "--json"], {
				shell: true,
				windowsHide: true,
			})

			let stdout = ""
			let stderr = ""

			process.stdout?.on("data", (data) => {
				stdout += data.toString()
			})

			process.stderr?.on("data", (data) => {
				stderr += data.toString()
			})

			process.on("error", (error) => {
				reject(new Error(`Failed to spawn CLI: ${error.message}`))
			})

			process.on("exit", (code) => {
				if (code === 0) {
					try {
						// Parse the JSON output to extract the token
						const result = JSON.parse(stdout)
						if (result.token) {
							resolve(result.token)
						} else {
							reject(new Error("No token in CLI response"))
						}
					} catch (error) {
						// If JSON parsing fails, try to extract token from plain text
						const tokenMatch = stdout.match(/token[:\s]+([a-zA-Z0-9\-._~+/]+=*)/i)
						if (tokenMatch) {
							resolve(tokenMatch[1])
						} else {
							reject(new Error(`Failed to parse CLI output: ${stdout}`))
						}
					}
				} else {
					reject(new Error(`CLI exited with code ${code}: ${stderr || stdout}`))
				}
			})

			// Timeout after 2 minutes (to allow for browser auth flow)
			setTimeout(() => {
				process.kill()
				reject(new Error("Sign-in timed out"))
			}, 120000)
		})
	}

	/**
	 * Check if a token is valid by making a test API call
	 */
	async validateToken(token: string): Promise<boolean> {
		try {
			// Make a simple API call to validate the token
			const response = await fetch("https://api.openai.com/v1/models", {
				headers: {
					Authorization: `Bearer ${token}`,
				},
			})
			return response.ok
		} catch {
			return false
		}
	}
}
