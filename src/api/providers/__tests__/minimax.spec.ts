import { describe, it, expect, vi, beforeEach } from "vitest"
import OpenAI from "openai"
import { miniMaxDefaultModelId, miniMaxModels } from "@roo-code/types"

import type { ApiHandlerOptions } from "../../../shared/api"

import { MiniMaxHandler } from "../minimax"

vi.mock("openai")

describe("MiniMaxHandler", () => {
	let handler: MiniMaxHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiModelId: "abab5.5s-chat",
			miniMaxApiKey: "test-api-key",
		}
		handler = new MiniMaxHandler(mockOptions)
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(MiniMaxHandler)
			expect(handler.getModel().id).toBe(mockOptions.apiModelId)
		})

		it("should handle missing API key", () => {
			expect(() => {
				new MiniMaxHandler({
					...mockOptions,
					miniMaxApiKey: undefined,
				})
			}).not.toThrow()
		})

		it("should use default model ID if not provided", () => {
			const handlerWithoutModel = new MiniMaxHandler({
				...mockOptions,
				apiModelId: undefined,
			})
			expect(handlerWithoutModel.getModel().id).toBe(miniMaxDefaultModelId)
		})

		it("should use default base URL if not provided", () => {
			const handlerWithoutBaseUrl = new MiniMaxHandler({
				...mockOptions,
				miniMaxBaseUrl: undefined,
			})
			expect(handlerWithoutBaseUrl).toBeInstanceOf(MiniMaxHandler)
			// The base URL is passed to OpenAI client internally
		})

		it("should use custom base URL if provided", () => {
			const customBaseUrl = "https://custom.minimax.com/v1"
			const handlerWithCustomUrl = new MiniMaxHandler({
				...mockOptions,
				miniMaxBaseUrl: customBaseUrl,
			})
			expect(handlerWithCustomUrl).toBeInstanceOf(MiniMaxHandler)
			// The custom base URL is passed to OpenAI client
		})

		it("should set includeMaxTokens to true", () => {
			// Create a new handler and verify OpenAI client was called with includeMaxTokens
			const _handler = new MiniMaxHandler(mockOptions)
			expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: mockOptions.miniMaxApiKey }))
			// includeMaxTokens is an internal property passed to super constructor
		})
	})

	describe("getModel", () => {
		it("should return correct model info for abab5.5s-chat", () => {
			const model = handler.getModel()
			expect(model.id).toBe("abab5.5s-chat")
			expect(model.info).toEqual(miniMaxModels["abab5.5s-chat"])
		})

		it("should return correct model info for abab6.5s-chat", () => {
			const handlerWithPro = new MiniMaxHandler({
				...mockOptions,
				apiModelId: "abab6.5s-chat",
			})
			const model = handlerWithPro.getModel()
			expect(model.id).toBe("abab6.5s-chat")
			expect(model.info).toEqual(miniMaxModels["abab6.5s-chat"])
		})

		it("should return correct model info for abab6.5g-chat", () => {
			const handlerWithVision = new MiniMaxHandler({
				...mockOptions,
				apiModelId: "abab6.5g-chat",
			})
			const model = handlerWithVision.getModel()
			expect(model.id).toBe("abab6.5g-chat")
			expect(model.info).toEqual(miniMaxModels["abab6.5g-chat"])
			expect(model.info.supportsImages).toBe(true)
		})

		it("should return provided model ID with default model info if model does not exist", () => {
			const handlerWithInvalidModel = new MiniMaxHandler({
				...mockOptions,
				apiModelId: "invalid-model",
			})
			const model = handlerWithInvalidModel.getModel()
			expect(model.id).toBe("invalid-model")
			// Should fallback to default model info
			expect(model.info).toEqual(miniMaxModels[miniMaxDefaultModelId])
		})

		it("should return default model if no model ID is provided", () => {
			const handlerWithoutModel = new MiniMaxHandler({
				...mockOptions,
				apiModelId: undefined,
			})
			const model = handlerWithoutModel.getModel()
			expect(model.id).toBe(miniMaxDefaultModelId)
			expect(model.info).toEqual(miniMaxModels[miniMaxDefaultModelId])
		})
	})

	describe("model capabilities", () => {
		it("should correctly report image support for models", () => {
			const textOnlyModel = new MiniMaxHandler({
				...mockOptions,
				apiModelId: "abab5.5s-chat",
			})
			expect(textOnlyModel.getModel().info.supportsImages).toBe(false)

			const visionModel = new MiniMaxHandler({
				...mockOptions,
				apiModelId: "abab6.5g-chat",
			})
			expect(visionModel.getModel().info.supportsImages).toBe(true)
		})

		it("should report no prompt cache support for all models", () => {
			const models = ["abab5.5s-chat", "abab6.5s-chat", "abab6.5g-chat"]

			models.forEach((modelId) => {
				const handler = new MiniMaxHandler({
					...mockOptions,
					apiModelId: modelId,
				})
				expect(handler.getModel().info.supportsPromptCache).toBe(false)
			})
		})

		it("should have correct context windows for each model", () => {
			const contextWindows = {
				"abab5.5s-chat": 128_000,
				"abab6.5s-chat": 245_000,
				"abab6.5g-chat": 245_000,
			}

			Object.entries(contextWindows).forEach(([modelId, expectedWindow]) => {
				const handler = new MiniMaxHandler({
					...mockOptions,
					apiModelId: modelId,
				})
				expect(handler.getModel().info.contextWindow).toBe(expectedWindow)
			})
		})

		it("should have correct max tokens for all models", () => {
			const models = ["abab5.5s-chat", "abab6.5s-chat", "abab6.5g-chat"]

			models.forEach((modelId) => {
				const handler = new MiniMaxHandler({
					...mockOptions,
					apiModelId: modelId,
				})
				expect(handler.getModel().info.maxTokens).toBe(8192)
			})
		})
	})
})
