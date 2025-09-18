/**
 * OAuth 2.1 types and interfaces for MCP server authentication
 * Implements RFC 6749, RFC 7636 (PKCE), RFC 8414, RFC 8707, RFC 9728
 */

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728)
 */
export interface ProtectedResourceMetadata {
	resource: string
	authorization_servers: string[]
	bearer_methods_supported?: string[]
	resource_documentation?: string
	resource_policy_uri?: string
	resource_tos_uri?: string
}

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 */
export interface AuthorizationServerMetadata {
	issuer: string
	authorization_endpoint: string
	token_endpoint: string
	jwks_uri?: string
	registration_endpoint?: string
	scopes_supported?: string[]
	response_types_supported: string[]
	response_modes_supported?: string[]
	grant_types_supported?: string[]
	token_endpoint_auth_methods_supported?: string[]
	token_endpoint_auth_signing_alg_values_supported?: string[]
	service_documentation?: string
	ui_locales_supported?: string[]
	op_policy_uri?: string
	op_tos_uri?: string
	revocation_endpoint?: string
	revocation_endpoint_auth_methods_supported?: string[]
	introspection_endpoint?: string
	introspection_endpoint_auth_methods_supported?: string[]
	code_challenge_methods_supported?: string[]
	// Additional OIDC Discovery fields
	userinfo_endpoint?: string
	end_session_endpoint?: string
	check_session_iframe?: string
	acr_values_supported?: string[]
	subject_types_supported?: string[]
	id_token_signing_alg_values_supported?: string[]
	id_token_encryption_alg_values_supported?: string[]
	id_token_encryption_enc_values_supported?: string[]
	userinfo_signing_alg_values_supported?: string[]
	userinfo_encryption_alg_values_supported?: string[]
	userinfo_encryption_enc_values_supported?: string[]
	request_object_signing_alg_values_supported?: string[]
	request_object_encryption_alg_values_supported?: string[]
	request_object_encryption_enc_values_supported?: string[]
	display_values_supported?: string[]
	claim_types_supported?: string[]
	claims_supported?: string[]
	claims_locales_supported?: string[]
	claims_parameter_supported?: boolean
	request_parameter_supported?: boolean
	request_uri_parameter_supported?: boolean
	require_request_uri_registration?: boolean
}

/**
 * Dynamic Client Registration Request (RFC 7591)
 */
export interface ClientRegistrationRequest {
	redirect_uris: string[]
	client_name?: string
	client_uri?: string
	logo_uri?: string
	scope?: string
	contacts?: string[]
	tos_uri?: string
	policy_uri?: string
	jwks_uri?: string
	jwks?: any
	software_id?: string
	software_version?: string
	grant_types?: string[]
	response_types?: string[]
	token_endpoint_auth_method?: string
}

/**
 * Dynamic Client Registration Response (RFC 7591)
 */
export interface ClientRegistrationResponse {
	client_id: string
	client_secret?: string
	client_id_issued_at?: number
	client_secret_expires_at?: number
	redirect_uris: string[]
	grant_types?: string[]
	response_types?: string[]
	token_endpoint_auth_method?: string
	client_name?: string
	client_uri?: string
	logo_uri?: string
	scope?: string
	contacts?: string[]
	tos_uri?: string
	policy_uri?: string
	jwks_uri?: string
	jwks?: any
	software_id?: string
	software_version?: string
}

/**
 * OAuth 2.0 Token Response
 */
export interface TokenResponse {
	access_token: string
	token_type: string
	expires_in?: number
	refresh_token?: string
	scope?: string
	id_token?: string // For OIDC
}

/**
 * OAuth 2.0 Error Response
 */
export interface OAuthError {
	error: string
	error_description?: string
	error_uri?: string
}

/**
 * PKCE (RFC 7636) parameters
 */
export interface PKCEChallenge {
	code_verifier: string
	code_challenge: string
	code_challenge_method: "S256"
}

/**
 * Stored OAuth credentials for an MCP server
 */
export interface StoredOAuthCredentials {
	serverName: string
	serverUrl: string
	clientId: string
	clientSecret?: string
	accessToken: string
	refreshToken?: string
	expiresAt?: number
	scope?: string
	tokenType: string
}

/**
 * OAuth configuration for an MCP server
 */
export interface OAuthConfig {
	clientId?: string
	clientSecret?: string
	scope?: string
	authorizationServerUrl?: string
	resourceUrl: string
}

/**
 * WWW-Authenticate header parsed values
 */
export interface WWWAuthenticateChallenge {
	scheme: string
	realm?: string
	scope?: string
	error?: string
	error_description?: string
	error_uri?: string
	resource?: string
	as_uri?: string
}
