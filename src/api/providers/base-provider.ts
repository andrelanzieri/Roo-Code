import { Anthropic } from "@anthropic-ai/sdk"
import * as vscode from "vscode"

import type { ModelInfo } from "@roo-code/types"

import type { ApiHandler, ApiHandlerCreateMessageMetadata } from "../index"
import { ApiStream } from "../transform/stream"
import { countTokens } from "../../utils/countTokens"

/**
 * Base class for API providers that implements common functionality.
 */
export abstract class BaseProvider implements ApiHandler {
	abstract createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream

	abstract getModel(): { id: string; info: ModelInfo }

	/**
	 * Default token counting implementation using tiktoken.
	 * Providers can override this to use their native token counting endpoints.
	 *
	 * @param content The content to count tokens for
	 * @returns A promise resolving to the token count
	 */
	async countTokens(content: Anthropic.Messages.ContentBlockParam[]): Promise<number> {
		if (content.length === 0) {
			return 0
		}

		return countTokens(content, { useWorker: true })
	}

	/**
	 * Returns whether this provider has the capability to support native tool calling.
	 * Default implementation returns false (no native tool support).
	 * Providers that DO support native tools should override this to return true.
	 *
	 * @returns false by default
	 */
	protected hasNativeToolCapability(): boolean {
		return false
	}

	/**
	 * Returns whether this provider supports native tool calling AND the user has enabled it.
	 * Combines provider capability with user setting.
	 *
	 * @returns true if provider supports it AND setting is enabled, false otherwise
	 */
	supportsNativeTools(): boolean {
		if (!this.hasNativeToolCapability()) {
			return false
		}
		return vscode.workspace.getConfiguration("roo-cline").get<boolean>("nativeToolCalling", false)
	}
}
