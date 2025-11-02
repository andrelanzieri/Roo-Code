// npx vitest utils/__tests__/cost.spec.ts

import type { ModelInfo } from "@roo-code/types"

import { calculateApiCostAnthropic, calculateApiCostOpenAI } from "../../shared/cost"

describe("Cost Utility", () => {
	describe("calculateApiCostAnthropic", () => {
		const mockModelInfo: ModelInfo = {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsPromptCache: true,
			inputPrice: 3.0, // $3 per million tokens
			outputPrice: 15.0, // $15 per million tokens
			cacheWritesPrice: 3.75, // $3.75 per million tokens
			cacheReadsPrice: 0.3, // $0.30 per million tokens
		}

		it("should calculate basic input/output costs correctly", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 1000, 500)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(1000)
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle cache writes cost", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 1000, 500, 2000)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache writes: (3.75 / 1_000_000) * 2000 = 0.0075
			// Total: 0.003 + 0.0075 + 0.0075 = 0.018
			expect(result.totalCost).toBeCloseTo(0.018, 6)
			expect(result.totalInputTokens).toBe(3000) // 1000 + 2000
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle cache reads cost", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 1000, 500, undefined, 3000)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache reads: (0.3 / 1_000_000) * 3000 = 0.0009
			// Total: 0.003 + 0.0075 + 0.0009 = 0.0114
			expect(result.totalCost).toBe(0.0114)
			expect(result.totalInputTokens).toBe(4000) // 1000 + 3000
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle all cost components together", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 1000, 500, 2000, 3000)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache writes: (3.75 / 1_000_000) * 2000 = 0.0075
			// Cache reads: (0.3 / 1_000_000) * 3000 = 0.0009
			// Total: 0.003 + 0.0075 + 0.0075 + 0.0009 = 0.0189
			expect(result.totalCost).toBe(0.0189)
			expect(result.totalInputTokens).toBe(6000) // 1000 + 2000 + 3000
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle missing prices gracefully", () => {
			const modelWithoutPrices: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200_000,
				supportsPromptCache: true,
			}

			const result = calculateApiCostAnthropic(modelWithoutPrices, 1000, 500, 2000, 3000)
			expect(result.totalCost).toBe(0)
			expect(result.totalInputTokens).toBe(6000) // 1000 + 2000 + 3000
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle zero tokens", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 0, 0, 0, 0)
			expect(result.totalCost).toBe(0)
			expect(result.totalInputTokens).toBe(0)
			expect(result.totalOutputTokens).toBe(0)
		})

		it("should handle undefined cache values", () => {
			const result = calculateApiCostAnthropic(mockModelInfo, 1000, 500)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(1000)
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle missing cache prices", () => {
			const modelWithoutCachePrices: ModelInfo = {
				...mockModelInfo,
				cacheWritesPrice: undefined,
				cacheReadsPrice: undefined,
			}

			const result = calculateApiCostAnthropic(modelWithoutCachePrices, 1000, 500, 2000, 3000)

			// Should only include input and output costs
			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(6000) // 1000 + 2000 + 3000
			expect(result.totalOutputTokens).toBe(500)
		})
	})

	describe("calculateApiCostOpenAI", () => {
		const mockModelInfo: ModelInfo = {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsPromptCache: true,
			inputPrice: 3.0, // $3 per million tokens
			outputPrice: 15.0, // $15 per million tokens
			cacheWritesPrice: 3.75, // $3.75 per million tokens
			cacheReadsPrice: 0.3, // $0.30 per million tokens
		}

		it("should calculate basic input/output costs correctly", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 1000, 500)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(1000)
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle cache writes cost", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 3000, 500, 2000)

			// Input cost: (3.0 / 1_000_000) * (3000 - 2000) = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache writes: (3.75 / 1_000_000) * 2000 = 0.0075
			// Total: 0.003 + 0.0075 + 0.0075 = 0.018
			expect(result.totalCost).toBeCloseTo(0.018, 6)
			expect(result.totalInputTokens).toBe(3000) // Total already includes cache
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle cache reads cost", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 4000, 500, undefined, 3000)

			// Input cost: (3.0 / 1_000_000) * (4000 - 3000) = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache reads: (0.3 / 1_000_000) * 3000 = 0.0009
			// Total: 0.003 + 0.0075 + 0.0009 = 0.0114
			expect(result.totalCost).toBe(0.0114)
			expect(result.totalInputTokens).toBe(4000) // Total already includes cache
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle all cost components together", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 6000, 500, 2000, 3000)

			// Input cost: (3.0 / 1_000_000) * (6000 - 2000 - 3000) = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Cache writes: (3.75 / 1_000_000) * 2000 = 0.0075
			// Cache reads: (0.3 / 1_000_000) * 3000 = 0.0009
			// Total: 0.003 + 0.0075 + 0.0075 + 0.0009 = 0.0189
			expect(result.totalCost).toBe(0.0189)
			expect(result.totalInputTokens).toBe(6000) // Total already includes cache
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle missing prices gracefully", () => {
			const modelWithoutPrices: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200_000,
				supportsPromptCache: true,
			}

			const result = calculateApiCostOpenAI(modelWithoutPrices, 1000, 500, 2000, 3000)
			expect(result.totalCost).toBe(0)
			expect(result.totalInputTokens).toBe(1000) // Total already includes cache
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle zero tokens", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 0, 0, 0, 0)
			expect(result.totalCost).toBe(0)
			expect(result.totalInputTokens).toBe(0)
			expect(result.totalOutputTokens).toBe(0)
		})

		it("should handle undefined cache values", () => {
			const result = calculateApiCostOpenAI(mockModelInfo, 1000, 500)

			// Input cost: (3.0 / 1_000_000) * 1000 = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(1000)
			expect(result.totalOutputTokens).toBe(500)
		})

		it("should handle missing cache prices", () => {
			const modelWithoutCachePrices: ModelInfo = {
				...mockModelInfo,
				cacheWritesPrice: undefined,
				cacheReadsPrice: undefined,
			}

			const result = calculateApiCostOpenAI(modelWithoutCachePrices, 6000, 500, 2000, 3000)

			// Should only include input and output costs
			// Input cost: (3.0 / 1_000_000) * (6000 - 2000 - 3000) = 0.003
			// Output cost: (15.0 / 1_000_000) * 500 = 0.0075
			// Total: 0.003 + 0.0075 = 0.0105
			expect(result.totalCost).toBe(0.0105)
			expect(result.totalInputTokens).toBe(6000) // Total already includes cache
			expect(result.totalOutputTokens).toBe(500)

			describe("tiered pricing", () => {
				const modelWithTiers: ModelInfo = {
					contextWindow: 200_000,
					supportsImages: true,
					supportsPromptCache: true,
					inputPrice: 3.0, // $3 per million tokens (<= 200K)
					outputPrice: 15.0, // $15 per million tokens (<= 200K)
					cacheWritesPrice: 3.75, // $3.75 per million tokens (<= 200K)
					cacheReadsPrice: 0.3, // $0.30 per million tokens (<= 200K)
					tiers: [
						{
							contextWindow: 1_000_000, // 1M tokens
							inputPrice: 6.0, // $6 per million tokens (> 200K)
							outputPrice: 22.5, // $22.50 per million tokens (> 200K)
							cacheWritesPrice: 7.5, // $7.50 per million tokens (> 200K)
							cacheReadsPrice: 0.6, // $0.60 per million tokens (> 200K)
						},
					],
				}

				it("should use base prices when total input tokens are below 200K", () => {
					const result = calculateApiCostAnthropic(modelWithTiers, 50_000, 10_000, 50_000, 50_000)

					// Total input: 50K + 50K + 50K = 150K (below 200K threshold)
					// Should use base prices: $3/$15
					// Input cost: (3.0 / 1_000_000) * 50_000 = 0.15
					// Output cost: (15.0 / 1_000_000) * 10_000 = 0.15
					// Cache writes: (3.75 / 1_000_000) * 50_000 = 0.1875
					// Cache reads: (0.3 / 1_000_000) * 50_000 = 0.015
					// Total: 0.15 + 0.15 + 0.1875 + 0.015 = 0.5025
					expect(result.totalInputTokens).toBe(150_000)
					expect(result.totalOutputTokens).toBe(10_000)
					expect(result.totalCost).toBeCloseTo(0.5025, 6)
				})

				it("should use tier prices when total input tokens exceed 200K", () => {
					const result = calculateApiCostAnthropic(modelWithTiers, 100_000, 20_000, 100_000, 100_000)

					// Total input: 100K + 100K + 100K = 300K (above 200K, below 1M)
					// Should use tier prices: $6/$22.50
					// Input cost: (6.0 / 1_000_000) * 100_000 = 0.6
					// Output cost: (22.5 / 1_000_000) * 20_000 = 0.45
					// Cache writes: (7.5 / 1_000_000) * 100_000 = 0.75
					// Cache reads: (0.6 / 1_000_000) * 100_000 = 0.06
					// Total: 0.6 + 0.45 + 0.75 + 0.06 = 1.86
					expect(result.totalInputTokens).toBe(300_000)
					expect(result.totalOutputTokens).toBe(20_000)
					expect(result.totalCost).toBeCloseTo(1.86, 6)
				})

				it("should use the highest tier prices when exceeding all tier thresholds", () => {
					const result = calculateApiCostAnthropic(modelWithTiers, 500_000, 50_000, 300_000, 300_000)

					// Total input: 500K + 300K + 300K = 1.1M (above 1M threshold)
					// Should use highest tier prices: $6/$22.50 (last tier)
					// Input cost: (6.0 / 1_000_000) * 500_000 = 3.0
					// Output cost: (22.5 / 1_000_000) * 50_000 = 1.125
					// Cache writes: (7.5 / 1_000_000) * 300_000 = 2.25
					// Cache reads: (0.6 / 1_000_000) * 300_000 = 0.18
					// Total: 3.0 + 1.125 + 2.25 + 0.18 = 6.555
					expect(result.totalInputTokens).toBe(1_100_000)
					expect(result.totalOutputTokens).toBe(50_000)
					expect(result.totalCost).toBeCloseTo(6.555, 6)
				})

				it("should handle partial tier definitions", () => {
					// Model where tier only overrides some prices
					const modelPartialTiers: ModelInfo = {
						contextWindow: 200_000,
						supportsImages: true,
						supportsPromptCache: true,
						inputPrice: 3.0,
						outputPrice: 15.0,
						cacheWritesPrice: 3.75,
						cacheReadsPrice: 0.3,
						tiers: [
							{
								contextWindow: 1_000_000,
								inputPrice: 6.0, // Only input price changes
								// output, cacheWrites, cacheReads prices should fall back to base
							},
						],
					}

					const result = calculateApiCostAnthropic(modelPartialTiers, 100_000, 20_000, 100_000, 100_000)

					// Total input: 300K (uses tier)
					// Input cost: (6.0 / 1_000_000) * 100_000 = 0.6 (tier price)
					// Output cost: (15.0 / 1_000_000) * 20_000 = 0.3 (base price)
					// Cache writes: (3.75 / 1_000_000) * 100_000 = 0.375 (base price)
					// Cache reads: (0.3 / 1_000_000) * 100_000 = 0.03 (base price)
					// Total: 0.6 + 0.3 + 0.375 + 0.03 = 1.305
					expect(result.totalInputTokens).toBe(300_000)
					expect(result.totalOutputTokens).toBe(20_000)
					expect(result.totalCost).toBeCloseTo(1.305, 6)
				})

				it("should handle multiple tiers correctly", () => {
					const modelMultipleTiers: ModelInfo = {
						contextWindow: 128_000,
						supportsImages: true,
						supportsPromptCache: true,
						inputPrice: 0.075, // <= 128K
						outputPrice: 0.3,
						tiers: [
							{
								contextWindow: 200_000, // First tier
								inputPrice: 0.15,
								outputPrice: 0.6,
							},
							{
								contextWindow: 1_000_000, // Second tier
								inputPrice: 0.3,
								outputPrice: 1.2,
							},
						],
					}

					// Test below first threshold (128K)
					let result = calculateApiCostAnthropic(modelMultipleTiers, 50_000, 10_000)
					expect(result.totalCost).toBeCloseTo((0.075 * 50 + 0.3 * 10) / 1000, 6)

					// Test between first and second threshold (150K)
					result = calculateApiCostAnthropic(modelMultipleTiers, 150_000, 10_000)
					expect(result.totalCost).toBeCloseTo((0.15 * 150 + 0.6 * 10) / 1000, 6)

					// Test above second threshold (500K)
					result = calculateApiCostAnthropic(modelMultipleTiers, 500_000, 10_000)
					expect(result.totalCost).toBeCloseTo((0.3 * 500 + 1.2 * 10) / 1000, 6)
				})
			})

			describe("tiered pricing for OpenAI", () => {
				const modelWithTiers: ModelInfo = {
					contextWindow: 200_000,
					supportsImages: true,
					supportsPromptCache: true,
					inputPrice: 3.0, // $3 per million tokens (<= 200K)
					outputPrice: 15.0, // $15 per million tokens (<= 200K)
					cacheWritesPrice: 3.75, // $3.75 per million tokens (<= 200K)
					cacheReadsPrice: 0.3, // $0.30 per million tokens (<= 200K)
					tiers: [
						{
							contextWindow: 1_000_000, // 1M tokens
							inputPrice: 6.0, // $6 per million tokens (> 200K)
							outputPrice: 22.5, // $22.50 per million tokens (> 200K)
							cacheWritesPrice: 7.5, // $7.50 per million tokens (> 200K)
							cacheReadsPrice: 0.6, // $0.60 per million tokens (> 200K)
						},
					],
				}

				it("should use tier prices for OpenAI when total input tokens exceed threshold", () => {
					// Total input: 300K (includes all tokens)
					const result = calculateApiCostOpenAI(modelWithTiers, 300_000, 20_000, 100_000, 100_000)

					// Total input is 300K (above 200K, below 1M) - uses tier pricing
					// Non-cached input: 300K - 100K - 100K = 100K
					// Input cost: (6.0 / 1_000_000) * 100_000 = 0.6
					// Output cost: (22.5 / 1_000_000) * 20_000 = 0.45
					// Cache writes: (7.5 / 1_000_000) * 100_000 = 0.75
					// Cache reads: (0.6 / 1_000_000) * 100_000 = 0.06
					// Total: 0.6 + 0.45 + 0.75 + 0.06 = 1.86
					expect(result.totalInputTokens).toBe(300_000)
					expect(result.totalOutputTokens).toBe(20_000)
					expect(result.totalCost).toBeCloseTo(1.86, 6)
				})

				it("should use base prices for OpenAI when total input tokens are below threshold", () => {
					// Total input: 150K (includes all tokens)
					const result = calculateApiCostOpenAI(modelWithTiers, 150_000, 10_000, 50_000, 50_000)

					// Total input is 150K (below 200K) - uses base pricing
					// Non-cached input: 150K - 50K - 50K = 50K
					// Input cost: (3.0 / 1_000_000) * 50_000 = 0.15
					// Output cost: (15.0 / 1_000_000) * 10_000 = 0.15
					// Cache writes: (3.75 / 1_000_000) * 50_000 = 0.1875
					// Cache reads: (0.3 / 1_000_000) * 50_000 = 0.015
					// Total: 0.15 + 0.15 + 0.1875 + 0.015 = 0.5025
					expect(result.totalInputTokens).toBe(150_000)
					expect(result.totalOutputTokens).toBe(10_000)
					expect(result.totalCost).toBeCloseTo(0.5025, 6)
				})
			})
		})
	})
})
