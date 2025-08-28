import { describe, it, expect, vi, beforeEach } from "vitest"
import { BaseOpenAiCompatibleProvider } from "../base-openai-compatible-provider"
import type { ApiHandlerOptions } from "../../../shared/api"
import type { ModelInfo } from "@roo-code/types"

// Create a concrete implementation for testing
class TestOpenAiCompatibleProvider extends BaseOpenAiCompatibleProvider<"test-model"> {
	constructor(options: ApiHandlerOptions) {
		super({
			providerName: "TestProvider",
			baseURL: options.openAiBaseUrl || "https://api.test.com/v1",
			defaultProviderModelId: "test-model",
			providerModels: {
				"test-model": {
					contextWindow: 4096,
					maxTokens: 1000,
					supportsPromptCache: false,
				} as ModelInfo,
			},
			...options,
		})
	}
}

describe("BaseOpenAiCompatibleProvider Error Handling", () => {
	let provider: TestOpenAiCompatibleProvider
	const mockApiKey = "test-api-key"
	const mockBaseUrl = "https://api.test.com/v1"

	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("enhanceErrorMessage", () => {
		it("should enhance 401 unauthorized errors with helpful suggestions", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("Unauthorized")
			;(mockError as any).status = 401

			// Access private method through type assertion
			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("OpenAI Compatible API Error (TestProvider)")
			expect(enhancedError.message).toContain("Verify your API key is correct")
			expect(enhancedError.message).toContain("Check if the API key format matches")
		})

		it("should enhance 404 not found errors with model and URL suggestions", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
				apiModelId: "custom-model",
			})

			const mockError = new Error("Not Found")
			;(mockError as any).status = 404

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("OpenAI Compatible API Error (TestProvider)")
			expect(enhancedError.message).toContain(`Verify the base URL is correct: ${mockBaseUrl}`)
			expect(enhancedError.message).toContain("Check if the model 'custom-model' is available")
			expect(enhancedError.message).toContain("Ensure the API endpoint path is correct")
		})

		it("should enhance rate limit errors with appropriate suggestions", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("Rate limit exceeded")
			;(mockError as any).status = 429

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("You've hit the rate limit")
			expect(enhancedError.message).toContain("Wait a moment before retrying")
			expect(enhancedError.message).toContain("Consider upgrading your API plan")
		})

		it("should enhance connection errors with network troubleshooting tips", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("ECONNREFUSED")

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain(`Cannot connect to ${mockBaseUrl}`)
			expect(enhancedError.message).toContain("Verify the server is running")
			expect(enhancedError.message).toContain("Check your network connection")
		})

		it("should enhance timeout errors with performance suggestions", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("Request timeout")

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("The request timed out")
			expect(enhancedError.message).toContain("server might be overloaded")
			expect(enhancedError.message).toContain("Try with a simpler request")
		})

		it("should enhance model not found errors", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
				apiModelId: "nonexistent-model",
			})

			const mockError = new Error("model 'nonexistent-model' not found")

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("The model 'nonexistent-model' may not be available")
			expect(enhancedError.message).toContain("Check the available models")
			expect(enhancedError.message).toContain("Try using a different model")
		})

		it("should provide general suggestions for unknown errors", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("Some unknown error")

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect(enhancedError.message).toContain("Verify your API configuration")
			expect(enhancedError.message).toContain("Check if the provider service is operational")
			expect(enhancedError.message).toContain("Try breaking down your request")
			expect(enhancedError.message).toContain("Consult your provider's documentation")
		})

		it("should preserve original error properties", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const mockError = new Error("Server error")
			;(mockError as any).status = 500
			;(mockError as any).code = "INTERNAL_ERROR"

			const enhancedError = (provider as any).enhanceErrorMessage(mockError)

			expect((enhancedError as any).status).toBe(500)
			expect((enhancedError as any).code).toBe("INTERNAL_ERROR")
		})

		it("should handle server errors (500, 502, 503) with appropriate suggestions", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			const serverErrors = [500, 502, 503]

			for (const status of serverErrors) {
				const mockError = new Error("Server error")
				;(mockError as any).status = status

				const enhancedError = (provider as any).enhanceErrorMessage(mockError)

				expect(enhancedError.message).toContain("The API server is experiencing issues")
				expect(enhancedError.message).toContain("Try again in a few moments")
				expect(enhancedError.message).toContain("Check your provider's status page")
			}
		})
	})

	describe("createMessage error handling", () => {
		it("should throw enhanced error when stream creation fails", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			// Mock the createStream method to throw an error
			const mockError = new Error("Connection failed")
			;(mockError as any).status = 500
			vi.spyOn(provider as any, "createStream").mockRejectedValue(mockError)

			const generator = provider.createMessage("system prompt", [])

			// Consume the generator and expect it to throw
			await expect(async () => {
				for await (const chunk of generator) {
					// This should not be reached
				}
			}).rejects.toThrow("OpenAI Compatible API Error (TestProvider)")
		})
	})

	describe("completePrompt error handling", () => {
		it("should throw enhanced error when completion fails", async () => {
			provider = new TestOpenAiCompatibleProvider({
				apiKey: mockApiKey,
				openAiBaseUrl: mockBaseUrl,
			})

			// Mock the client to throw an error
			const mockError = new Error("API key invalid")
			;(mockError as any).status = 401
			vi.spyOn((provider as any).client.chat.completions, "create").mockRejectedValue(mockError)

			await expect(provider.completePrompt("test prompt")).rejects.toThrow(
				"OpenAI Compatible API Error (TestProvider)",
			)
		})
	})
})
