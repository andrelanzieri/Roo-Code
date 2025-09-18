/**
 * Unit tests for OAuth 2.1 Client
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import { OAuthClient } from "../OAuthClient"
import {
	AuthorizationServerMetadata,
	ClientRegistrationResponse,
	ProtectedResourceMetadata,
	TokenResponse,
} from "../types"

// Mock vscode
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
	window: {
		showInputBox: vi.fn(),
	},
	env: {
		openExternal: vi.fn(),
	},
	Uri: {
		parse: vi.fn((uri: string) => ({ toString: () => uri })),
	},
}))

// Mock fetch
global.fetch = vi.fn()

describe("OAuthClient", () => {
	let client: OAuthClient
	let mockContext: any

	beforeEach(() => {
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		}
		client = new OAuthClient("test-server", "https://mcp.example.com", mockContext)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("parseWWWAuthenticate", () => {
		it("should parse Bearer challenge with all parameters", () => {
			const header =
				'Bearer realm="example", scope="read write", resource="https://api.example.com", as_uri="https://auth.example.com"'
			const result = client.parseWWWAuthenticate(header)

			expect(result).toEqual({
				scheme: "Bearer",
				realm: "example",
				scope: "read write",
				resource: "https://api.example.com",
				as_uri: "https://auth.example.com",
			})
		})

		it("should parse Bearer challenge with error", () => {
			const header = 'Bearer error="invalid_token", error_description="Token expired"'
			const result = client.parseWWWAuthenticate(header)

			expect(result).toEqual({
				scheme: "Bearer",
				error: "invalid_token",
				error_description: "Token expired",
			})
		})

		it("should throw on invalid header format", () => {
			expect(() => client.parseWWWAuthenticate("InvalidHeader")).toThrow("Invalid WWW-Authenticate header format")
		})
	})

	describe("discoverResourceMetadata", () => {
		it("should fetch and return valid resource metadata", async () => {
			const mockMetadata: ProtectedResourceMetadata = {
				resource: "https://mcp.example.com",
				authorization_servers: ["https://auth.example.com"],
				bearer_methods_supported: ["header"],
			}

			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => mockMetadata,
			} as Response)

			const result = await client.discoverResourceMetadata("https://mcp.example.com")

			expect(global.fetch).toHaveBeenCalledWith(
				"https://mcp.example.com/.well-known/oauth-protected-resource",
				expect.objectContaining({
					method: "GET",
					headers: {
						Accept: "application/json",
					},
				}),
			)
			expect(result).toEqual(mockMetadata)
		})

		it("should throw on invalid metadata", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => ({ invalid: "data" }),
			} as Response)

			await expect(client.discoverResourceMetadata("https://mcp.example.com")).rejects.toThrow(
				"Invalid resource metadata: missing required fields",
			)
		})

		it("should throw on HTTP error", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: false,
				status: 404,
				statusText: "Not Found",
			} as Response)

			await expect(client.discoverResourceMetadata("https://mcp.example.com")).rejects.toThrow(
				"Failed to fetch resource metadata: 404 Not Found",
			)
		})
	})

	describe("discoverAuthorizationServerMetadata", () => {
		const validMetadata: AuthorizationServerMetadata = {
			issuer: "https://auth.example.com",
			authorization_endpoint: "https://auth.example.com/authorize",
			token_endpoint: "https://auth.example.com/token",
			response_types_supported: ["code"],
			code_challenge_methods_supported: ["S256"],
		}

		it("should discover metadata for issuer without path", async () => {
			vi.mocked(global.fetch)
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => validMetadata,
				} as Response)

			const result = await client.discoverAuthorizationServerMetadata("https://auth.example.com")

			expect(global.fetch).toHaveBeenCalledTimes(2)
			expect(global.fetch).toHaveBeenNthCalledWith(
				1,
				"https://auth.example.com/.well-known/oauth-authorization-server",
				expect.any(Object),
			)
			expect(global.fetch).toHaveBeenNthCalledWith(
				2,
				"https://auth.example.com/.well-known/openid-configuration",
				expect.any(Object),
			)
			expect(result).toEqual(validMetadata)
		})

		it("should discover metadata for issuer with path", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => validMetadata,
			} as Response)

			const result = await client.discoverAuthorizationServerMetadata("https://auth.example.com/tenant1")

			expect(global.fetch).toHaveBeenCalledWith(
				"https://auth.example.com/.well-known/oauth-authorization-server/tenant1",
				expect.any(Object),
			)
			expect(result).toEqual(validMetadata)
		})

		it("should reject server without PKCE support", async () => {
			const noPKCEMetadata = {
				...validMetadata,
				code_challenge_methods_supported: undefined,
			}

			// Mock both discovery endpoints to return the same metadata
			vi.mocked(global.fetch)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => noPKCEMetadata,
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => noPKCEMetadata,
				} as Response)

			await expect(client.discoverAuthorizationServerMetadata("https://auth.example.com")).rejects.toThrow(
				"Authorization server does not support PKCE with S256 method",
			)
		})

		it("should reject server with wrong PKCE method", async () => {
			const wrongPKCEMetadata = {
				...validMetadata,
				code_challenge_methods_supported: ["plain"],
			}

			// Mock both discovery endpoints to return the same metadata
			vi.mocked(global.fetch)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => wrongPKCEMetadata,
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					json: async () => wrongPKCEMetadata,
				} as Response)

			await expect(client.discoverAuthorizationServerMetadata("https://auth.example.com")).rejects.toThrow(
				"Authorization server does not support PKCE with S256 method",
			)
		})
	})

	describe("registerClient", () => {
		const mockMetadata: AuthorizationServerMetadata = {
			issuer: "https://auth.example.com",
			authorization_endpoint: "https://auth.example.com/authorize",
			token_endpoint: "https://auth.example.com/token",
			registration_endpoint: "https://auth.example.com/register",
			response_types_supported: ["code"],
		}

		it("should register client successfully", async () => {
			const mockResponse: ClientRegistrationResponse = {
				client_id: "test-client-id",
				client_secret: "test-client-secret",
				redirect_uris: ["vscode://RooCodeInc.roo-code/oauth-callback"],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
			}

			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			} as Response)

			const result = await client.registerClient(mockMetadata)

			expect(global.fetch).toHaveBeenCalledWith(
				"https://auth.example.com/register",
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
					},
					body: expect.stringContaining("Roo Code MCP Client"),
				}),
			)
			expect(result).toEqual(mockResponse)
			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_client_test-server", mockResponse)
		})

		it("should throw if registration endpoint not available", async () => {
			const noRegMetadata = {
				...mockMetadata,
				registration_endpoint: undefined,
			}

			await expect(client.registerClient(noRegMetadata)).rejects.toThrow(
				"Authorization server does not support dynamic client registration",
			)
		})

		it("should throw on registration error", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: false,
				status: 400,
				statusText: "Bad Request",
				json: async () => ({
					error: "invalid_request",
					error_description: "Invalid client metadata",
				}),
			} as Response)

			await expect(client.registerClient(mockMetadata)).rejects.toThrow(
				"Client registration failed: invalid_request - Invalid client metadata",
			)
		})
	})

	describe("generatePKCEChallenge", () => {
		it("should generate valid PKCE challenge", () => {
			const pkce = client.generatePKCEChallenge()

			expect(pkce.code_verifier).toHaveLength(128)
			expect(pkce.code_challenge).toBeTruthy()
			expect(pkce.code_challenge_method).toBe("S256")

			// Verify verifier uses valid characters (base64url)
			expect(pkce.code_verifier).toMatch(/^[A-Za-z0-9_-]+$/)
			expect(pkce.code_challenge).toMatch(/^[A-Za-z0-9_-]+$/)
		})

		it("should generate different challenges each time", () => {
			const pkce1 = client.generatePKCEChallenge()
			const pkce2 = client.generatePKCEChallenge()

			expect(pkce1.code_verifier).not.toBe(pkce2.code_verifier)
			expect(pkce1.code_challenge).not.toBe(pkce2.code_challenge)
		})
	})

	describe("buildAuthorizationUrl", () => {
		const mockMetadata: AuthorizationServerMetadata = {
			issuer: "https://auth.example.com",
			authorization_endpoint: "https://auth.example.com/authorize",
			token_endpoint: "https://auth.example.com/token",
			response_types_supported: ["code"],
		}

		it("should build valid authorization URL", () => {
			const pkce = client.generatePKCEChallenge()
			const url = client.buildAuthorizationUrl(
				mockMetadata,
				"test-client-id",
				pkce,
				"https://mcp.example.com",
				"read write",
			)

			const urlObj = new URL(url)
			expect(urlObj.origin).toBe("https://auth.example.com")
			expect(urlObj.pathname).toBe("/authorize")

			const params = urlObj.searchParams
			expect(params.get("response_type")).toBe("code")
			expect(params.get("client_id")).toBe("test-client-id")
			expect(params.get("redirect_uri")).toBe("vscode://RooCodeInc.roo-code/oauth-callback")
			expect(params.get("state")).toBeTruthy()
			expect(params.get("code_challenge")).toBe(pkce.code_challenge)
			expect(params.get("code_challenge_method")).toBe("S256")
			expect(params.get("resource")).toBe("https://mcp.example.com")
			expect(params.get("scope")).toBe("read write")
		})

		it("should store state for validation", () => {
			const pkce = client.generatePKCEChallenge()
			client.buildAuthorizationUrl(mockMetadata, "test-client-id", pkce, "https://mcp.example.com")

			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_state_test-server", expect.any(String))
		})
	})

	describe("exchangeCodeForTokens", () => {
		const mockMetadata: AuthorizationServerMetadata = {
			issuer: "https://auth.example.com",
			authorization_endpoint: "https://auth.example.com/authorize",
			token_endpoint: "https://auth.example.com/token",
			response_types_supported: ["code"],
		}

		const pkce = {
			code_verifier: "test-verifier",
			code_challenge: "test-challenge",
			code_challenge_method: "S256" as const,
		}

		it("should exchange code for tokens successfully", async () => {
			const mockTokens: TokenResponse = {
				access_token: "test-access-token",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "test-refresh-token",
				scope: "read write",
			}

			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => mockTokens,
			} as Response)

			const result = await client.exchangeCodeForTokens(
				mockMetadata,
				"test-code",
				"test-client-id",
				"test-client-secret",
				pkce,
				"https://mcp.example.com",
			)

			expect(global.fetch).toHaveBeenCalledWith(
				"https://auth.example.com/token",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/x-www-form-urlencoded",
						Authorization: expect.stringMatching(/^Basic /),
					}),
					body: expect.stringContaining("grant_type=authorization_code"),
				}),
			)

			// Verify body contains all required parameters
			const body = vi.mocked(global.fetch).mock.calls[0][1]?.body as string
			expect(body).toContain("code=test-code")
			expect(body).toContain("client_id=test-client-id")
			expect(body).toContain("code_verifier=test-verifier")
			expect(body).toContain("resource=https%3A%2F%2Fmcp.example.com")

			expect(result).toEqual(mockTokens)
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"oauth_credentials_test-server",
				expect.objectContaining({
					accessToken: "test-access-token",
					refreshToken: "test-refresh-token",
				}),
			)
		})

		it("should handle public client (no secret)", async () => {
			const mockTokens: TokenResponse = {
				access_token: "test-access-token",
				token_type: "Bearer",
			}

			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => mockTokens,
			} as Response)

			await client.exchangeCodeForTokens(
				mockMetadata,
				"test-code",
				"test-client-id",
				undefined,
				pkce,
				"https://mcp.example.com",
			)

			const headers = vi.mocked(global.fetch).mock.calls[0][1]?.headers as any
			expect(headers.Authorization).toBeUndefined()
		})

		it("should throw on token exchange error", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: false,
				json: async () => ({
					error: "invalid_grant",
					error_description: "Invalid authorization code",
				}),
			} as Response)

			await expect(
				client.exchangeCodeForTokens(
					mockMetadata,
					"test-code",
					"test-client-id",
					undefined,
					pkce,
					"https://mcp.example.com",
				),
			).rejects.toThrow("Token exchange failed: invalid_grant - Invalid authorization code")
		})
	})

	describe("refreshAccessToken", () => {
		const mockMetadata: AuthorizationServerMetadata = {
			issuer: "https://auth.example.com",
			authorization_endpoint: "https://auth.example.com/authorize",
			token_endpoint: "https://auth.example.com/token",
			response_types_supported: ["code"],
		}

		it("should refresh token successfully", async () => {
			const mockTokens: TokenResponse = {
				access_token: "new-access-token",
				token_type: "Bearer",
				expires_in: 3600,
				refresh_token: "new-refresh-token",
			}

			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: true,
				json: async () => mockTokens,
			} as Response)

			const result = await client.refreshAccessToken(
				mockMetadata,
				"old-refresh-token",
				"test-client-id",
				"test-client-secret",
				"https://mcp.example.com",
			)

			expect(global.fetch).toHaveBeenCalledWith(
				"https://auth.example.com/token",
				expect.objectContaining({
					method: "POST",
					body: expect.stringContaining("grant_type=refresh_token"),
				}),
			)

			const body = vi.mocked(global.fetch).mock.calls[0][1]?.body as string
			expect(body).toContain("refresh_token=old-refresh-token")
			expect(body).toContain("resource=https%3A%2F%2Fmcp.example.com")

			expect(result).toEqual(mockTokens)
		})

		it("should throw on refresh error", async () => {
			vi.mocked(global.fetch).mockResolvedValueOnce({
				ok: false,
				json: async () => ({
					error: "invalid_grant",
					error_description: "Refresh token expired",
				}),
			} as Response)

			await expect(
				client.refreshAccessToken(
					mockMetadata,
					"expired-token",
					"test-client-id",
					undefined,
					"https://mcp.example.com",
				),
			).rejects.toThrow("Token refresh failed: invalid_grant - Refresh token expired")
		})
	})

	describe("isTokenExpired", () => {
		it("should return true for expired token", () => {
			const credentials = {
				serverName: "test",
				serverUrl: "https://mcp.example.com",
				clientId: "test-client",
				accessToken: "test-token",
				tokenType: "Bearer",
				expiresAt: Date.now() - 60000, // Expired 1 minute ago
			}

			expect(client.isTokenExpired(credentials)).toBe(true)
		})

		it("should return true for token about to expire", () => {
			const credentials = {
				serverName: "test",
				serverUrl: "https://mcp.example.com",
				clientId: "test-client",
				accessToken: "test-token",
				tokenType: "Bearer",
				expiresAt: Date.now() + 15000, // Expires in 15 seconds (within 30s buffer)
			}

			expect(client.isTokenExpired(credentials)).toBe(true)
		})

		it("should return false for valid token", () => {
			const credentials = {
				serverName: "test",
				serverUrl: "https://mcp.example.com",
				clientId: "test-client",
				accessToken: "test-token",
				tokenType: "Bearer",
				expiresAt: Date.now() + 3600000, // Expires in 1 hour
			}

			expect(client.isTokenExpired(credentials)).toBe(false)
		})

		it("should return false for token without expiry", () => {
			const credentials = {
				serverName: "test",
				serverUrl: "https://mcp.example.com",
				clientId: "test-client",
				accessToken: "test-token",
				tokenType: "Bearer",
			}

			expect(client.isTokenExpired(credentials)).toBe(false)
		})
	})

	describe("validateState", () => {
		it("should validate matching state", async () => {
			mockContext.globalState.get.mockReturnValueOnce("test-state")

			const isValid = await client.validateState("test-state")

			expect(isValid).toBe(true)
			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_state_test-server", undefined)
		})

		it("should reject mismatched state", async () => {
			mockContext.globalState.get.mockReturnValueOnce("expected-state")

			const isValid = await client.validateState("wrong-state")

			expect(isValid).toBe(false)
			expect(mockContext.globalState.update).not.toHaveBeenCalled()
		})

		it("should reject when no stored state", async () => {
			mockContext.globalState.get.mockReturnValueOnce(null)

			const isValid = await client.validateState("some-state")

			expect(isValid).toBe(false)
		})
	})

	describe("clearCredentials", () => {
		it("should clear all stored OAuth data", async () => {
			await client.clearCredentials()

			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_credentials_test-server", undefined)
			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_client_test-server", undefined)
			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_state_test-server", undefined)
			expect(mockContext.globalState.update).toHaveBeenCalledWith("oauth_pkce_test-server", undefined)
		})
	})
})
