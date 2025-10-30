import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"
import type { ProviderSettings } from "@roo-code/types"
import { fetchRouterModels } from "../index"
import { getModels } from "../../../api/providers/fetchers/modelCache"
import { CloudService } from "@roo-code/cloud"

// Mock dependencies
vi.mock("../../../api/providers/fetchers/modelCache")
vi.mock("@roo-code/cloud")

const mockGetModels = getModels as Mock<typeof getModels>
const mockCloudService = CloudService as any

describe("RouterModelsService", () => {
	const mockModels = {
		"test-model": {
			maxTokens: 4096,
			contextWindow: 8192,
			supportsPromptCache: false,
			description: "Test model",
		},
	}

	const baseApiConfiguration: ProviderSettings = {
		apiProvider: "openrouter",
		openRouterApiKey: "test-key",
		requestyApiKey: "requesty-key",
		unboundApiKey: "unbound-key",
		ioIntelligenceApiKey: "io-key",
		deepInfraApiKey: "deepinfra-key",
		litellmApiKey: "litellm-key",
		litellmBaseUrl: "http://localhost:4000",
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockGetModels.mockResolvedValue(mockModels)
		mockCloudService.hasInstance = vi.fn().mockReturnValue(false)
	})

	describe("fetchRouterModels", () => {
		it("fetches all providers when activeProviderOnly is false", async () => {
			const result = await fetchRouterModels({
				apiConfiguration: baseApiConfiguration,
				activeProviderOnly: false,
			})

			// Should fetch all standard providers
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "openrouter" })
			expect(mockGetModels).toHaveBeenCalledWith(
				expect.objectContaining({ provider: "requesty", apiKey: "requesty-key" }),
			)
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "glama" })
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "unbound", apiKey: "unbound-key" })
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "vercel-ai-gateway" })
			expect(mockGetModels).toHaveBeenCalledWith(
				expect.objectContaining({ provider: "deepinfra", apiKey: "deepinfra-key" }),
			)
			expect(mockGetModels).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "roo",
					baseUrl: "https://api.roocode.com/proxy",
				}),
			)
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "io-intelligence", apiKey: "io-key" })
			expect(mockGetModels).toHaveBeenCalledWith({
				provider: "litellm",
				apiKey: "litellm-key",
				baseUrl: "http://localhost:4000",
			})

			// Should return models for all providers
			expect(result.routerModels).toHaveProperty("openrouter")
			expect(result.routerModels).toHaveProperty("requesty")
			expect(result.routerModels).toHaveProperty("glama")
			expect(result.errors).toEqual([])
		})

		it("fetches only active provider when activeProviderOnly is true", async () => {
			const result = await fetchRouterModels({
				apiConfiguration: { ...baseApiConfiguration, apiProvider: "openrouter" },
				activeProviderOnly: true,
			})

			// Should only fetch openrouter
			expect(mockGetModels).toHaveBeenCalledTimes(1)
			expect(mockGetModels).toHaveBeenCalledWith({ provider: "openrouter" })

			// Should return models only for openrouter
			expect(result.routerModels.openrouter).toEqual(mockModels)
			expect(result.errors).toEqual([])
		})

		it("includes ollama when it is the active provider", async () => {
			const config: ProviderSettings = {
				...baseApiConfiguration,
				apiProvider: "ollama",
				ollamaBaseUrl: "http://localhost:11434",
			}

			await fetchRouterModels({
				apiConfiguration: config,
				activeProviderOnly: true,
			})

			expect(mockGetModels).toHaveBeenCalledWith({
				provider: "ollama",
				baseUrl: "http://localhost:11434",
				apiKey: undefined,
			})
		})

		it("includes lmstudio when it is the active provider", async () => {
			const config: ProviderSettings = {
				...baseApiConfiguration,
				apiProvider: "lmstudio",
				lmStudioBaseUrl: "http://localhost:1234",
			}

			await fetchRouterModels({
				apiConfiguration: config,
				activeProviderOnly: true,
			})

			expect(mockGetModels).toHaveBeenCalledWith({
				provider: "lmstudio",
				baseUrl: "http://localhost:1234",
			})
		})

		it("includes huggingface when it is the active provider", async () => {
			const config: ProviderSettings = {
				...baseApiConfiguration,
				apiProvider: "huggingface",
			}

			await fetchRouterModels({
				apiConfiguration: config,
				activeProviderOnly: true,
			})

			expect(mockGetModels).toHaveBeenCalledWith({
				provider: "huggingface",
			})
		})

		it("uses litellmOverrides when provided", async () => {
			await fetchRouterModels({
				apiConfiguration: { ...baseApiConfiguration, litellmApiKey: undefined, litellmBaseUrl: undefined },
				activeProviderOnly: false,
				litellmOverrides: {
					apiKey: "override-key",
					baseUrl: "http://override:5000",
				},
			})

			expect(mockGetModels).toHaveBeenCalledWith({
				provider: "litellm",
				apiKey: "override-key",
				baseUrl: "http://override:5000",
			})
		})

		it("handles provider fetch errors gracefully", async () => {
			mockGetModels
				.mockResolvedValueOnce(mockModels) // openrouter succeeds
				.mockRejectedValueOnce(new Error("Requesty API error")) // requesty fails
				.mockResolvedValueOnce(mockModels) // glama succeeds

			const result = await fetchRouterModels({
				apiConfiguration: baseApiConfiguration,
				activeProviderOnly: false,
			})

			// Should have errors for failed provider
			expect(result.errors).toHaveLength(1)
			expect(result.errors[0]).toEqual({
				provider: "requesty",
				error: "Requesty API error",
			})

			// Should have empty object for failed provider
			expect(result.routerModels.requesty).toEqual({})

			// Should have models for successful providers
			expect(result.routerModels.openrouter).toEqual(mockModels)
		})

		it("skips litellm when no api key or base url provided", async () => {
			const config: ProviderSettings = {
				...baseApiConfiguration,
				litellmApiKey: undefined,
				litellmBaseUrl: undefined,
			}

			await fetchRouterModels({
				apiConfiguration: config,
				activeProviderOnly: false,
			})

			// Should not call getModels for litellm
			expect(mockGetModels).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "litellm" }))
		})

		it("skips io-intelligence when no api key provided", async () => {
			const config: ProviderSettings = {
				...baseApiConfiguration,
				ioIntelligenceApiKey: undefined,
			}

			await fetchRouterModels({
				apiConfiguration: config,
				activeProviderOnly: false,
			})

			// Should not call getModels for io-intelligence
			expect(mockGetModels).not.toHaveBeenCalledWith(expect.objectContaining({ provider: "io-intelligence" }))
		})

		it("uses roo session token when CloudService is available", async () => {
			const mockAuthService = {
				getSessionToken: vi.fn().mockReturnValue("session-token-123"),
			}

			vi.mocked(CloudService.hasInstance).mockReturnValue(true)
			Object.defineProperty(CloudService, "instance", {
				get: () => ({ authService: mockAuthService }),
				configurable: true,
			})

			await fetchRouterModels({
				apiConfiguration: baseApiConfiguration,
				activeProviderOnly: false,
			})

			expect(mockGetModels).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "roo",
					apiKey: "session-token-123",
				}),
			)
		})

		it("initializes all providers with empty objects", async () => {
			const result = await fetchRouterModels({
				apiConfiguration: { apiProvider: "openrouter" } as ProviderSettings,
				activeProviderOnly: true,
			})

			// All providers should be initialized even if not fetched
			expect(result.routerModels).toHaveProperty("openrouter")
			expect(result.routerModels).toHaveProperty("requesty")
			expect(result.routerModels).toHaveProperty("glama")
			expect(result.routerModels).toHaveProperty("unbound")
			expect(result.routerModels).toHaveProperty("vercel-ai-gateway")
			expect(result.routerModels).toHaveProperty("deepinfra")
			expect(result.routerModels).toHaveProperty("roo")
			expect(result.routerModels).toHaveProperty("litellm")
			expect(result.routerModels).toHaveProperty("ollama")
			expect(result.routerModels).toHaveProperty("lmstudio")
			expect(result.routerModels).toHaveProperty("huggingface")
			expect(result.routerModels).toHaveProperty("io-intelligence")
		})
	})
})
