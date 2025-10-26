/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

/**
 * Check if a model should use single file read format
 * @param modelId The model ID to check
 * @param useSingleFileReadMode Optional user preference to force single file mode
 * @returns true if the model should use single file reads
 */
export function shouldUseSingleFileRead(modelId: string | undefined, useSingleFileReadMode?: boolean): boolean {
	// If user has explicitly set the preference, use it (both true and false)
	if (useSingleFileReadMode !== undefined) {
		return useSingleFileReadMode
	}

	// If no modelId provided, default to false
	if (!modelId) {
		return false
	}

	// Otherwise, check if the model is known to have issues with multi-file format
	return modelId.includes("grok-code-fast-1") || modelId.includes("code-supernova")
}
