/**
 * Configuration for models that should use simplified single-file read_file tool
 * These models will use the simpler <read_file><path>...</path></read_file> format
 * instead of the more complex multi-file args format
 */

/**
 * Check if a model should use single file read format
 * @param _modelId The model ID to check (unused - all models now use full format)
 * @returns true if the model should use single file reads
 */
export function shouldUseSingleFileRead(_modelId: string): boolean {
	// Currently no models require the simplified format
	// Grok models now support the full args format with line ranges
	return false
}
