import { ToolProtocol, TOOL_PROTOCOL } from "@roo-code/types"
import type { ProviderSettings, ModelInfo } from "@roo-code/types"

/**
 * Resolve the effective tool protocol based on the precedence hierarchy:
 *
 * 1. User Preference - Per-Profile (explicit profile setting)
 * 2. Model Default (defaultToolProtocol in ModelInfo)
 * 3. XML Fallback (final fallback)
 *
 * Then check support: if protocol is "native" but model doesn't support it, use XML.
 *
 * @param providerSettings - The provider settings for the current profile
 * @param modelInfo - Optional model information containing capabilities
 * @returns The resolved tool protocol (either "xml" or "native")
 */
export function resolveToolProtocol(providerSettings: ProviderSettings, modelInfo?: ModelInfo): ToolProtocol {
	// Special handling for OpenAI Compatible and Ollama providers:
	// Allow user to override tool protocol even for unknown models
	const isUserConfigurableProvider =
		providerSettings.apiProvider === "openai" || providerSettings.apiProvider === "ollama"

	// 1. User Preference - Per-Profile (explicit profile setting, highest priority)
	if (providerSettings.toolProtocol) {
		// For user-configurable providers, always respect the user's choice
		if (isUserConfigurableProvider) {
			return providerSettings.toolProtocol
		}

		// For other providers, only use native if model supports it
		if (providerSettings.toolProtocol === TOOL_PROTOCOL.NATIVE && modelInfo?.supportsNativeTools !== true) {
			return TOOL_PROTOCOL.XML
		}

		return providerSettings.toolProtocol
	}

	// If model doesn't support native tools and it's not a user-configurable provider, return XML
	// Treat undefined as unsupported (only allow native when explicitly true)
	if (modelInfo?.supportsNativeTools !== true && !isUserConfigurableProvider) {
		return TOOL_PROTOCOL.XML
	}

	// 2. Model Default - model's preferred protocol
	if (modelInfo?.defaultToolProtocol) {
		return modelInfo.defaultToolProtocol
	}

	// 3. XML Fallback
	return TOOL_PROTOCOL.XML
}
