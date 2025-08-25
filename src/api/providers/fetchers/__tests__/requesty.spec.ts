import { describe, it, expect, vi, beforeEach } from "vitest"
import axios from "axios"
import { getRequestyModels } from "../requesty"

vi.mock("axios")

describe("getRequestyModels", () => {
	const mockAxios = axios as any

	beforeEach(() => {
		vi.clearAllMocks()
	})

	const mockModelsResponse = {
		data: {
			data: [
				{
					id: "test-model",
					max_output_tokens: 4096,
					context_window: 128000,
					supports_caching: true,
					supports_vision: true,
					supports_computer_use: false,
					supports_reasoning: false,
					input_price: 3,
					output_price: 15,
					caching_price: 3.75,
					cached_price: 0.3,
					description: "Test model",
				},
			],
		},
	}

	describe("URL construction", () => {
		it("should correctly append /models to default base URL", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			await getRequestyModels()

			expect(mockAxios.get).toHaveBeenCalledWith("https://router.requesty.ai/v1/models", { headers: {} })
		})

		it("should correctly append /models to custom base URL with /v1", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			await getRequestyModels("https://custom.requesty.ai/v1")

			expect(mockAxios.get).toHaveBeenCalledWith("https://custom.requesty.ai/v1/models", { headers: {} })
		})

		it("should correctly append /models to custom base URL with trailing slash", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			await getRequestyModels("https://custom.requesty.ai/v1/")

			expect(mockAxios.get).toHaveBeenCalledWith("https://custom.requesty.ai/v1/models", { headers: {} })
		})

		it("should correctly append /models to custom base URL without /v1", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			await getRequestyModels("https://custom.requesty.ai")

			expect(mockAxios.get).toHaveBeenCalledWith("https://custom.requesty.ai/models", { headers: {} })
		})

		it("should include authorization header when API key is provided", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			await getRequestyModels("https://custom.requesty.ai/v1", "test-api-key")

			expect(mockAxios.get).toHaveBeenCalledWith("https://custom.requesty.ai/v1/models", {
				headers: { Authorization: "Bearer test-api-key" },
			})
		})
	})

	describe("model parsing", () => {
		it("should correctly parse model information", async () => {
			mockAxios.get = vi.fn().mockResolvedValue(mockModelsResponse)

			const models = await getRequestyModels()

			expect(models["test-model"]).toEqual({
				maxTokens: 4096,
				contextWindow: 128000,
				supportsPromptCache: true,
				supportsImages: true,
				supportsComputerUse: false,
				supportsReasoningBudget: false,
				supportsReasoningEffort: false,
				inputPrice: 3000000, // parseApiPrice multiplies by 1,000,000
				outputPrice: 15000000, // parseApiPrice multiplies by 1,000,000
				description: "Test model",
				cacheWritesPrice: 3750000, // parseApiPrice multiplies by 1,000,000
				cacheReadsPrice: 300000, // parseApiPrice multiplies by 1,000,000
			})
		})

		it("should handle reasoning support for Claude models", async () => {
			const claudeResponse = {
				data: {
					data: [
						{
							id: "claude-3-opus",
							max_output_tokens: 4096,
							context_window: 200000,
							supports_caching: true,
							supports_vision: true,
							supports_computer_use: true,
							supports_reasoning: true,
							input_price: 15,
							output_price: 75,
							caching_price: 18.75,
							cached_price: 1.5,
							description: "Claude 3 Opus",
						},
					],
				},
			}

			mockAxios.get = vi.fn().mockResolvedValue(claudeResponse)

			const models = await getRequestyModels()

			expect(models["claude-3-opus"]).toBeDefined()
			expect(models["claude-3-opus"].supportsReasoningBudget).toBe(true)
			expect(models["claude-3-opus"].supportsReasoningEffort).toBe(false)
		})

		it("should handle reasoning support for OpenAI models", async () => {
			const openaiResponse = {
				data: {
					data: [
						{
							id: "openai/gpt-4",
							max_output_tokens: 4096,
							context_window: 128000,
							supports_caching: false,
							supports_vision: true,
							supports_computer_use: false,
							supports_reasoning: true,
							input_price: 10,
							output_price: 30,
							caching_price: 0,
							cached_price: 0,
							description: "GPT-4",
						},
					],
				},
			}

			mockAxios.get = vi.fn().mockResolvedValue(openaiResponse)

			const models = await getRequestyModels()

			expect(models["openai/gpt-4"]).toBeDefined()
			expect(models["openai/gpt-4"].supportsReasoningBudget).toBe(false)
			expect(models["openai/gpt-4"].supportsReasoningEffort).toBe(true)
		})
	})

	describe("error handling", () => {
		it("should return empty object on API error", async () => {
			mockAxios.get = vi.fn().mockRejectedValue(new Error("API Error"))

			const models = await getRequestyModels()

			expect(models).toEqual({})
		})

		it("should log error details", async () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
			mockAxios.get = vi.fn().mockRejectedValue(new Error("API Error"))

			await getRequestyModels()

			expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Error fetching Requesty models:"))

			consoleErrorSpy.mockRestore()
		})
	})
})
