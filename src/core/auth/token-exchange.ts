import axios from "axios"
import * as vscode from "vscode"
import { CHATGPT_OAUTH_CONFIG, type TokenExchangeRequest } from "@roo-code/types"
import { parseJWT, formatOAuthError } from "./oauth-helpers"

/**
 * Exchange OAuth ID token for an OpenAI API key
 */
export async function exchangeTokenForApiKey(idToken: string): Promise<string | null> {
	try {
		// Parse the ID token to check for organization/project
		const claims = parseJWT(idToken)
		if (!claims) {
			throw new Error("Invalid ID token format")
		}

		// Check if user has organization or project access
		const hasOrgAccess = claims.organizations && claims.organizations.length > 0
		const hasProjectAccess = claims.projects && claims.projects.length > 0
		const isPersonalAllowed = claims.personal_access === true

		if (!hasOrgAccess && !hasProjectAccess && !isPersonalAllowed) {
			// User needs to complete Platform onboarding
			const result = await vscode.window.showWarningMessage(
				"Your ChatGPT account needs to be set up for API access. Please complete the OpenAI Platform onboarding to continue.",
				"Open Platform Setup",
				"Cancel",
			)

			if (result === "Open Platform Setup") {
				vscode.env.openExternal(vscode.Uri.parse("https://platform.openai.com/onboarding"))
			}

			return null
		}

		// Perform token exchange
		const tokenExchangeRequest: TokenExchangeRequest = {
			grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
			requested_token_type: "openai-api-key",
			subject_token: idToken,
			subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
			client_id: CHATGPT_OAUTH_CONFIG.clientId,
		}

		const response = await axios.post(
			CHATGPT_OAUTH_CONFIG.tokenUrl,
			new URLSearchParams(tokenExchangeRequest as any),
			{
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			},
		)

		const { access_token } = response.data

		if (!access_token) {
			throw new Error("No API key returned from token exchange")
		}

		return access_token
	} catch (error: any) {
		// Handle specific error cases
		if (error.response?.status === 403) {
			await vscode.window.showErrorMessage(
				"Your ChatGPT account doesn't have API access. Please ensure you have a Plus or Pro subscription and have completed Platform setup.",
			)
			return null
		}

		if (error.response?.data) {
			const errorMessage = formatOAuthError(error.response.data)
			await vscode.window.showErrorMessage(`Token exchange failed: ${errorMessage}`)
			return null
		}

		throw error
	}
}

/**
 * Attempt to redeem complimentary credits for Plus/Pro users
 * This is a best-effort operation and failures are non-fatal
 */
export async function redeemComplimentaryCredits(idToken: string): Promise<void> {
	try {
		// Parse the ID token to check subscription status
		const claims = parseJWT(idToken)
		if (!claims) {
			return
		}

		// Check if user has Plus or Pro subscription
		const hasPlus = claims.subscription?.includes("plus")
		const hasPro = claims.subscription?.includes("pro")

		if (!hasPlus && !hasPro) {
			return // Not eligible for complimentary credits
		}

		// Attempt to redeem credits
		await axios.post(
			"https://api.openai.com/v1/billing/redeem_credits",
			{
				id_token: idToken,
			},
			{
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${idToken}`,
				},
			},
		)

		// Success - notify user
		vscode.window.showInformationMessage("Complimentary API credits have been applied to your account!")
	} catch (error) {
		// Silently fail - this is a best-effort operation
		console.log("Failed to redeem complimentary credits:", error)
	}
}

/**
 * Validate that an API key is working
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
	try {
		// Make a simple API call to validate the key
		const response = await axios.get("https://api.openai.com/v1/models", {
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		})

		return response.status === 200
	} catch (error: any) {
		if (error.response?.status === 401) {
			return false // Invalid API key
		}
		// For other errors, assume the key might be valid but there's a network issue
		return true
	}
}

/**
 * Get organization and project information from ID token
 */
export function getTokenMetadata(idToken: string): {
	organizations?: string[]
	projects?: string[]
	email?: string
	name?: string
} {
	const claims = parseJWT(idToken)
	if (!claims) {
		return {}
	}

	return {
		organizations: claims.organizations,
		projects: claims.projects,
		email: claims.email,
		name: claims.name,
	}
}
