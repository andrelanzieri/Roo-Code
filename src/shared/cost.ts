import type { ModelInfo } from "@roo-code/types"

export interface ApiCostResult {
	totalInputTokens: number
	totalOutputTokens: number
	totalCost: number
}

/**
 * Finds the appropriate pricing tier based on the total input tokens.
 * Returns the prices from the matching tier, or the base prices if no tiers are defined.
 */
function getTieredPricing(
	modelInfo: ModelInfo,
	totalInputTokens: number,
): {
	inputPrice: number | undefined
	outputPrice: number | undefined
	cacheWritesPrice: number | undefined
	cacheReadsPrice: number | undefined
} {
	// If there are no tiers defined, use the base prices
	if (!modelInfo.tiers || modelInfo.tiers.length === 0) {
		return {
			inputPrice: modelInfo.inputPrice,
			outputPrice: modelInfo.outputPrice,
			cacheWritesPrice: modelInfo.cacheWritesPrice,
			cacheReadsPrice: modelInfo.cacheReadsPrice,
		}
	}

	// If within base context window, use base prices
	if (totalInputTokens <= modelInfo.contextWindow) {
		return {
			inputPrice: modelInfo.inputPrice,
			outputPrice: modelInfo.outputPrice,
			cacheWritesPrice: modelInfo.cacheWritesPrice,
			cacheReadsPrice: modelInfo.cacheReadsPrice,
		}
	}

	// Find the appropriate tier based on the total input tokens
	// Tiers are checked in order, and we use the first tier where the token count
	// is less than or equal to the tier's context window
	const tier = modelInfo.tiers.find((tier) => totalInputTokens <= tier.contextWindow)

	if (tier) {
		// Use tier prices, falling back to base prices if not defined in the tier
		return {
			inputPrice: tier.inputPrice ?? modelInfo.inputPrice,
			outputPrice: tier.outputPrice ?? modelInfo.outputPrice,
			cacheWritesPrice: tier.cacheWritesPrice ?? modelInfo.cacheWritesPrice,
			cacheReadsPrice: tier.cacheReadsPrice ?? modelInfo.cacheReadsPrice,
		}
	}

	// If no tier matches (all tiers have smaller context windows than the token count),
	// use the last (highest) tier's prices
	const lastTier = modelInfo.tiers[modelInfo.tiers.length - 1]
	return {
		inputPrice: lastTier.inputPrice ?? modelInfo.inputPrice,
		outputPrice: lastTier.outputPrice ?? modelInfo.outputPrice,
		cacheWritesPrice: lastTier.cacheWritesPrice ?? modelInfo.cacheWritesPrice,
		cacheReadsPrice: lastTier.cacheReadsPrice ?? modelInfo.cacheReadsPrice,
	}
}

function calculateApiCostInternal(
	modelInfo: ModelInfo,
	inputTokens: number,
	outputTokens: number,
	cacheCreationInputTokens: number,
	cacheReadInputTokens: number,
	totalInputTokens: number,
	totalOutputTokens: number,
): ApiCostResult {
	// Get the appropriate prices based on the total input tokens (for tiered pricing)
	const { inputPrice, outputPrice, cacheWritesPrice, cacheReadsPrice } = getTieredPricing(modelInfo, totalInputTokens)

	const cacheWritesCost = ((cacheWritesPrice || 0) / 1_000_000) * cacheCreationInputTokens
	const cacheReadsCost = ((cacheReadsPrice || 0) / 1_000_000) * cacheReadInputTokens
	const baseInputCost = ((inputPrice || 0) / 1_000_000) * inputTokens
	const outputCost = ((outputPrice || 0) / 1_000_000) * outputTokens
	const totalCost = cacheWritesCost + cacheReadsCost + baseInputCost + outputCost

	return {
		totalInputTokens,
		totalOutputTokens,
		totalCost,
	}
}

// For Anthropic compliant usage, the input tokens count does NOT include the
// cached tokens.
export function calculateApiCostAnthropic(
	modelInfo: ModelInfo,
	inputTokens: number,
	outputTokens: number,
	cacheCreationInputTokens?: number,
	cacheReadInputTokens?: number,
): ApiCostResult {
	const cacheCreation = cacheCreationInputTokens || 0
	const cacheRead = cacheReadInputTokens || 0

	// For Anthropic: inputTokens does NOT include cached tokens
	// Total input = base input + cache creation + cache reads
	const totalInputTokens = inputTokens + cacheCreation + cacheRead

	return calculateApiCostInternal(
		modelInfo,
		inputTokens,
		outputTokens,
		cacheCreation,
		cacheRead,
		totalInputTokens,
		outputTokens,
	)
}

// For OpenAI compliant usage, the input tokens count INCLUDES the cached tokens.
export function calculateApiCostOpenAI(
	modelInfo: ModelInfo,
	inputTokens: number,
	outputTokens: number,
	cacheCreationInputTokens?: number,
	cacheReadInputTokens?: number,
): ApiCostResult {
	const cacheCreationInputTokensNum = cacheCreationInputTokens || 0
	const cacheReadInputTokensNum = cacheReadInputTokens || 0
	const nonCachedInputTokens = Math.max(0, inputTokens - cacheCreationInputTokensNum - cacheReadInputTokensNum)

	// For OpenAI: inputTokens ALREADY includes all tokens (cached + non-cached)
	// So we pass the original inputTokens as the total
	return calculateApiCostInternal(
		modelInfo,
		nonCachedInputTokens,
		outputTokens,
		cacheCreationInputTokensNum,
		cacheReadInputTokensNum,
		inputTokens,
		outputTokens,
	)
}

export const parseApiPrice = (price: any) => (price ? parseFloat(price) * 1_000_000 : undefined)
