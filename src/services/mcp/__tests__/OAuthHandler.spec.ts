import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { OAuthHandler, OAuthConfig } from "../OAuthHandler"
import * as fs from "fs/promises"
import * as http from "http"

// Mock vscode
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	env: {
		openExternal: vi.fn().mockResolvedValue(true),
	},
	Uri: {
		parse: vi.fn((str: string) => ({ toString: () => str })),
	},
	ExtensionContext: vi.fn(),
}))

// Mock fs
vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
	access: vi.fn(),
}))

// Mock http
vi.mock("http", () => {
	const mockServer = {
		listen: vi.fn((port: number, host: string, callback: () => void) => {
			callback()
		}),
		close: vi.fn(),
		on: vi.fn(),
	}
	return {
		createServer: vi.fn(() => mockServer),
		Server: vi.fn(),
	}
})

// Mock pkce-challenge
vi.mock("pkce-challenge", () => ({
	default: vi.fn().mockResolvedValue({
		code_challenge: "test_challenge",
		code_verifier: "test_verifier",
	}),
}))

describe("OAuthHandler", () => {
	let mockContext: vscode.ExtensionContext
	let oauthHandler: OAuthHandler

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks()

		// Create mock context
		mockContext = {
			globalStorageUri: {
				fsPath: "/test/storage",
			},
		} as any

		// Reset singleton
		;(OAuthHandler as any).instance = null
	})

	afterEach(() => {
		// Clean up
		if (oauthHandler) {
			oauthHandler.dispose()
		}
	})

	describe("getInstance", () => {
		it("should create a singleton instance", () => {
			const instance1 = OAuthHandler.getInstance(mockContext)
			const instance2 = OAuthHandler.getInstance(mockContext)

			expect(instance1).toBe(instance2)
		})
	})

	describe("getStoredTokens", () => {
		it("should return null when no tokens are stored", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))

			oauthHandler = OAuthHandler.getInstance(mockContext)
			const tokens = await oauthHandler.getStoredTokens("test-server")

			expect(tokens).toBeNull()
		})

		it("should return stored tokens when they exist and are valid", async () => {
			const storedData = {
				"test-server": {
					tokens: {
						accessToken: "test_token",
						refreshToken: "refresh_token",
						expiresAt: Date.now() + 3600000, // 1 hour from now
					},
					serverName: "test-server",
					timestamp: Date.now(),
				},
			}

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(storedData))

			oauthHandler = OAuthHandler.getInstance(mockContext)
			const tokens = await oauthHandler.getStoredTokens("test-server")

			expect(tokens).toEqual({
				accessToken: "test_token",
				refreshToken: "refresh_token",
				expiresAt: expect.any(Number),
			})
		})

		it("should return null when tokens are expired", async () => {
			const storedData = {
				"test-server": {
					tokens: {
						accessToken: "test_token",
						refreshToken: "refresh_token",
						expiresAt: Date.now() - 3600000, // 1 hour ago
					},
					serverName: "test-server",
					timestamp: Date.now(),
				},
			}

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(storedData))

			oauthHandler = OAuthHandler.getInstance(mockContext)
			const tokens = await oauthHandler.getStoredTokens("test-server")

			expect(tokens).toBeNull()
		})
	})

	describe("clearTokens", () => {
		it("should remove tokens for a server", async () => {
			const storedData = {
				"test-server": {
					tokens: {
						accessToken: "test_token",
					},
					serverName: "test-server",
					timestamp: Date.now(),
				},
			}

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(storedData))
			vi.mocked(fs.writeFile).mockResolvedValue()

			oauthHandler = OAuthHandler.getInstance(mockContext)
			await oauthHandler.clearTokens("test-server")

			// Check that writeFile was called with empty object for that server
			expect(fs.writeFile).toHaveBeenCalledWith(
				expect.stringContaining("mcp-oauth-tokens.json"),
				expect.stringContaining("{}"),
			)
		})
	})

	describe("authenticate", () => {
		it("should return stored tokens if they exist", async () => {
			const storedData = {
				"test-server": {
					tokens: {
						accessToken: "stored_token",
						refreshToken: "stored_refresh",
						expiresAt: Date.now() + 3600000,
					},
					serverName: "test-server",
					timestamp: Date.now(),
				},
			}

			vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(storedData))

			oauthHandler = OAuthHandler.getInstance(mockContext)

			const config: OAuthConfig = {
				clientId: "test_client",
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
			}

			const tokens = await oauthHandler.authenticate("test-server", config)

			expect(tokens).toEqual({
				accessToken: "stored_token",
				refreshToken: "stored_refresh",
				expiresAt: expect.any(Number),
			})

			// Should not open browser if tokens exist
			expect(vscode.env.openExternal).not.toHaveBeenCalled()
		})

		it("should start OAuth flow when no tokens exist", async () => {
			vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))

			oauthHandler = OAuthHandler.getInstance(mockContext)

			const config: OAuthConfig = {
				clientId: "test_client",
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
				scopes: ["read", "write"],
			}

			// Start authentication (won't complete without callback)
			const authPromise = oauthHandler.authenticate("test-server", config)

			// Should open browser
			expect(vscode.env.openExternal).toHaveBeenCalledWith(
				expect.objectContaining({
					toString: expect.any(Function),
				}),
			)

			// Check the URL that was opened
			const urlArg = vi.mocked(vscode.env.openExternal).mock.calls[0][0]
			const url = urlArg.toString()
			expect(url).toContain("https://auth.example.com/authorize")
			expect(url).toContain("client_id=test_client")
			expect(url).toContain("response_type=code")
			expect(url).toContain("scope=read%20write")
			expect(url).toContain("code_challenge=test_challenge")
		})
	})

	describe("refreshToken", () => {
		it("should refresh tokens successfully", async () => {
			// Mock successful token refresh response
			global.fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					access_token: "new_access_token",
					refresh_token: "new_refresh_token",
					expires_in: 3600,
					token_type: "Bearer",
				}),
			})

			vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))
			vi.mocked(fs.writeFile).mockResolvedValue()
			vi.mocked(fs.mkdir).mockResolvedValue(undefined as any)

			oauthHandler = OAuthHandler.getInstance(mockContext)

			const config: OAuthConfig = {
				clientId: "test_client",
				clientSecret: "test_secret",
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
			}

			const tokens = await oauthHandler.refreshToken("test-server", config, "old_refresh_token")

			expect(tokens).toEqual({
				accessToken: "new_access_token",
				refreshToken: "new_refresh_token",
				expiresAt: expect.any(Number),
				tokenType: "Bearer",
				scope: undefined,
			})

			// Check that fetch was called with correct parameters
			expect(global.fetch).toHaveBeenCalledWith(
				"https://auth.example.com/token",
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: expect.stringContaining("grant_type=refresh_token"),
				}),
			)
		})

		it("should return null when refresh fails", async () => {
			// Mock failed token refresh response
			global.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 401,
				text: async () => "Invalid refresh token",
			})

			vi.mocked(fs.readFile).mockRejectedValue(new Error("File not found"))

			oauthHandler = OAuthHandler.getInstance(mockContext)

			const config: OAuthConfig = {
				clientId: "test_client",
				authorizationUrl: "https://auth.example.com/authorize",
				tokenUrl: "https://auth.example.com/token",
			}

			const tokens = await oauthHandler.refreshToken("test-server", config, "invalid_refresh_token")

			expect(tokens).toBeNull()
		})
	})
})
