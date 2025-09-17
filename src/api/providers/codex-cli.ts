import { type CodexCliModelId, codexCliDefaultModelId, codexCliModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../shared/api"
import { ContextProxy } from "../../core/config/ContextProxy"

import { BaseOpenAiCompatibleProvider } from "./base-openai-compatible-provider"

export class CodexCliHandler extends BaseOpenAiCompatibleProvider<CodexCliModelId> {
	constructor(options: ApiHandlerOptions) {
		// Get the session token from VS Code Secret Storage if available
		let sessionToken = ""
		let baseURL = "http://localhost:3000/v1" // Default local URL for Codex CLI

		// Try to get the stored session token and base URL
		try {
			if (ContextProxy.instance) {
				// Use getSecret for the session token (it's a secret)
				sessionToken = ContextProxy.instance.getSecret("codexCliSessionToken") || ""
				// Use getValue for the base URL (it's not a secret)
				const storedBaseUrl = ContextProxy.instance.getValue("codexCliBaseUrl")
				if (storedBaseUrl) {
					baseURL = storedBaseUrl
				}
			}
		} catch (error) {
			// If ContextProxy is not initialized, continue with defaults
			console.debug("ContextProxy not available, using default values for Codex CLI")
		}

		// Check if a custom CLI path is configured
		const cliPath = options.codexCliPath

		// Always construct the handler, even without a valid token.
		// The backend will return 401 if authentication fails.
		super({
			...options,
			providerName: "Codex CLI",
			baseURL: options.codexCliBaseUrl || baseURL,
			apiKey: sessionToken || "unauthenticated", // Use a placeholder if no token
			defaultProviderModelId: codexCliDefaultModelId,
			providerModels: codexCliModels,
			defaultTemperature: 0.7,
		})
	}
}
