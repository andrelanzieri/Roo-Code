import { z } from "zod"

/**
 * OAuth configuration for ChatGPT authentication
 */
export const CHATGPT_OAUTH_CONFIG = {
	clientId: "app_EMoamEEZ73f0CkXaXp7hrann", // Codex CLI client ID for compatibility
	authorizationUrl: "https://auth.openai.com/oauth/authorize",
	tokenUrl: "https://auth.openai.com/oauth/token",
	redirectUri: "http://localhost:1455/auth/callback",
	defaultPort: 1455,
	scopes: ["openid", "profile", "email", "offline_access"],
} as const

/**
 * OAuth tokens structure
 */
export const oauthTokensSchema = z.object({
	accessToken: z.string(),
	idToken: z.string(),
	refreshToken: z.string(),
	expiresIn: z.number().optional(),
	tokenType: z.string().optional(),
})

export type OAuthTokens = z.infer<typeof oauthTokensSchema>

/**
 * ChatGPT credentials stored in SecretStorage
 */
export const chatGptCredentialsSchema = z.object({
	apiKey: z.string().optional(), // Exchanged API key
	idToken: z.string(),
	refreshToken: z.string(),
	lastRefreshIso: z.string().optional(),
	responseId: z.string().optional(), // For conversation continuity
})

export type ChatGptCredentials = z.infer<typeof chatGptCredentialsSchema>

/**
 * Codex CLI auth.json structure for import
 */
export const codexAuthJsonSchema = z.object({
	OPENAI_API_KEY: z.string().optional(),
	tokens: z
		.object({
			id_token: z.string(),
			access_token: z.string().optional(),
			refresh_token: z.string().optional(),
		})
		.optional(),
	last_refresh: z.string().optional(),
})

export type CodexAuthJson = z.infer<typeof codexAuthJsonSchema>

/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
	state: string
	codeVerifier: string
	timestamp: number
}

/**
 * Token exchange request for getting API key from OAuth tokens
 */
export interface TokenExchangeRequest {
	grant_type: "urn:ietf:params:oauth:grant-type:token-exchange"
	requested_token_type: "openai-api-key"
	subject_token: string // ID token
	subject_token_type: "urn:ietf:params:oauth:token-type:id_token"
	client_id: string
}

/**
 * OAuth error response
 */
export const oauthErrorSchema = z.object({
	error: z.string(),
	error_description: z.string().optional(),
})

export type OAuthError = z.infer<typeof oauthErrorSchema>
