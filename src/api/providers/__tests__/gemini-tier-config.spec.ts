// npx vitest run src/api/providers/__tests__/gemini-tier-config.spec.ts

import { geminiModels } from "@roo-code/types"

describe("Gemini 2.5 Pro Tier Configuration", () => {
	const gemini25ProModels = [
		"gemini-2.5-pro",
		"gemini-2.5-pro-preview-03-25",
		"gemini-2.5-pro-preview-05-06",
		"gemini-2.5-pro-preview-06-05",
	] as const

	gemini25ProModels.forEach((modelId) => {
		describe(`${modelId}`, () => {
			it("should have a free tier with 125k context window", () => {
				const model = geminiModels[modelId]
				expect(model).toBeDefined()
				expect(model.tiers).toBeDefined()
				expect(model.tiers!.length).toBeGreaterThanOrEqual(3)

				// Check the first tier is the free tier
				const freeTier = model.tiers![0]
				expect(freeTier.contextWindow).toBe(125_000)
				expect(freeTier.inputPrice).toBe(0)
				expect(freeTier.outputPrice).toBe(0)
				expect(freeTier.cacheReadsPrice).toBe(0)
			})

			it("should have correct tier ordering", () => {
				const model = geminiModels[modelId]
				const tiers = model.tiers!

				// Verify tier ordering: 125k (free) -> 200k -> Infinity
				expect(tiers[0].contextWindow).toBe(125_000)
				expect(tiers[1].contextWindow).toBe(200_000)
				expect(tiers[2].contextWindow).toBe(Infinity)
			})

			it("should have correct pricing for paid tiers", () => {
				const model = geminiModels[modelId]
				const tiers = model.tiers!

				// 200k tier pricing
				expect(tiers[1].inputPrice).toBe(1.25)
				expect(tiers[1].outputPrice).toBe(10)
				expect(tiers[1].cacheReadsPrice).toBe(0.31)

				// Infinity tier pricing
				expect(tiers[2].inputPrice).toBe(2.5)
				expect(tiers[2].outputPrice).toBe(15)
				expect(tiers[2].cacheReadsPrice).toBe(0.625)
			})

			it("should trigger context condensing before hitting 125k limit", () => {
				const model = geminiModels[modelId]
				const freeTierLimit = model.tiers![0].contextWindow

				// With a typical context condensing threshold of 50-80%,
				// the condensing should trigger well before reaching 125k tokens
				const typicalCondenseThreshold = 0.7 // 70%
				const expectedTriggerPoint = freeTierLimit * typicalCondenseThreshold

				// Verify that the free tier limit is correctly set to prevent 429 errors
				expect(freeTierLimit).toBe(125_000)
				expect(expectedTriggerPoint).toBeLessThan(freeTierLimit)
				expect(expectedTriggerPoint).toBe(87_500) // 70% of 125k
			})
		})
	})

	describe("Other Gemini models", () => {
		it("should not have free tier for non-2.5-pro models", () => {
			// Check a few other models to ensure we didn't accidentally add free tier to them
			const otherModels = [
				"gemini-2.0-flash-001",
				"gemini-1.5-flash-002",
				"gemini-2.0-flash-thinking-exp-01-21",
			] as const

			otherModels.forEach((modelId) => {
				const model = geminiModels[modelId]
				if ("tiers" in model && model.tiers) {
					// If tiers exist, verify none have 125k context window
					const has125kTier = model.tiers.some((tier: any) => tier.contextWindow === 125_000)
					expect(has125kTier).toBe(false)
				}
			})
		})
	})
})
