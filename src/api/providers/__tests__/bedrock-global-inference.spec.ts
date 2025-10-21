// npx vitest run src/api/providers/__tests__/bedrock-global-inference.spec.ts

import { AWS_GLOBAL_INFERENCE_PREFIX, BEDROCK_GLOBAL_INFERENCE_MODEL_IDS } from "@roo-code/types"
import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock AWS SDK
vitest.mock("@aws-sdk/client-bedrock-runtime", () => {
	return {
		BedrockRuntimeClient: vitest.fn().mockImplementation(() => ({
			send: vitest.fn(),
			config: { region: "us-east-1" },
		})),
		ConverseCommand: vitest.fn(),
		ConverseStreamCommand: vitest.fn(),
	}
})

describe("Amazon Bedrock Global Inference", () => {
	// Helper function to create a handler with specific options
	const createHandler = (options: Partial<ApiHandlerOptions> = {}) => {
		const defaultOptions: ApiHandlerOptions = {
			apiModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
			awsRegion: "us-east-1",
			...options,
		}
		return new AwsBedrockHandler(defaultOptions)
	}

	describe("AWS_GLOBAL_INFERENCE_PREFIX constant", () => {
		it("should have the correct global inference prefix", () => {
			expect(AWS_GLOBAL_INFERENCE_PREFIX).toBe("global.")
		})
	})

	describe("BEDROCK_GLOBAL_INFERENCE_MODEL_IDS constant", () => {
		it("should contain the expected models that support global inference", () => {
			const expectedModels = [
				"anthropic.claude-sonnet-4-20250514-v1:0",
				"anthropic.claude-sonnet-4-5-20250929-v1:0",
				"anthropic.claude-opus-4-20250514-v1:0",
				"anthropic.claude-opus-4-1-20250805-v1:0",
				"anthropic.claude-3-7-sonnet-20250219-v1:0",
				"anthropic.claude-haiku-4-5-20251001-v1:0",
			]
			expect(BEDROCK_GLOBAL_INFERENCE_MODEL_IDS).toEqual(expectedModels)
		})
	})

	describe("Global inference with supported models", () => {
		it("should apply global. prefix when global inference is enabled for Claude Sonnet 4", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-sonnet-4-20250514-v1:0")
		})

		it("should apply global. prefix when global inference is enabled for Claude Sonnet 4.5", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-sonnet-4-5-20250929-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-sonnet-4-5-20250929-v1:0")
		})

		it("should apply global. prefix when global inference is enabled for Claude Opus 4", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-opus-4-20250514-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-opus-4-20250514-v1:0")
		})

		it("should apply global. prefix when global inference is enabled for Claude Opus 4.1", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-opus-4-1-20250805-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-opus-4-1-20250805-v1:0")
		})

		it("should apply global. prefix when global inference is enabled for Claude 3.7 Sonnet", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-3-7-sonnet-20250219-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-3-7-sonnet-20250219-v1:0")
		})

		it("should apply global. prefix when global inference is enabled for Claude Haiku 4.5", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-haiku-4-5-20251001-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-haiku-4-5-20251001-v1:0")
		})
	})

	describe("Global inference with unsupported models", () => {
		it("should NOT apply global. prefix for unsupported Claude 3 Sonnet model", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("anthropic.claude-3-sonnet-20240229-v1:0")
		})

		it("should NOT apply global. prefix for unsupported Claude 3 Haiku model", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "anthropic.claude-3-haiku-20240307-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("anthropic.claude-3-haiku-20240307-v1:0")
		})

		it("should NOT apply global. prefix for Amazon Nova models", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "amazon.nova-pro-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("amazon.nova-pro-v1:0")
		})

		it("should NOT apply global. prefix for Llama models", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				apiModelId: "meta.llama3-1-70b-instruct-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("meta.llama3-1-70b-instruct-v1:0")
		})
	})

	describe("Global inference priority over cross-region inference", () => {
		it("should prioritize global inference over cross-region inference when both are enabled", () => {
			const handler = createHandler({
				awsUseGlobalInference: true,
				awsUseCrossRegionInference: true,
				awsRegion: "us-east-1",
				apiModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
			})

			const model = handler.getModel()
			// Should use global. prefix, not us. prefix
			expect(model.id).toBe("global.anthropic.claude-sonnet-4-20250514-v1:0")
		})

		it("should fall back to cross-region inference when global is disabled", () => {
			const handler = createHandler({
				awsUseGlobalInference: false,
				awsUseCrossRegionInference: true,
				awsRegion: "us-east-1",
				apiModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
			})

			const model = handler.getModel()
			// Should use us. prefix for cross-region inference
			expect(model.id).toBe("us.anthropic.claude-sonnet-4-20250514-v1:0")
		})

		it("should apply no prefix when both global and cross-region are disabled", () => {
			const handler = createHandler({
				awsUseGlobalInference: false,
				awsUseCrossRegionInference: false,
				awsRegion: "us-east-1",
				apiModelId: "anthropic.claude-sonnet-4-20250514-v1:0",
			})

			const model = handler.getModel()
			// Should have no prefix
			expect(model.id).toBe("anthropic.claude-sonnet-4-20250514-v1:0")
		})
	})

	describe("Global inference with custom ARNs", () => {
		it("should parse global inference from ARN", () => {
			const handler = createHandler({
				awsCustomArn:
					"arn:aws:bedrock:us-east-1:123456789012:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0",
			})

			const model = handler.getModel()
			expect(model.id).toBe("global.anthropic.claude-sonnet-4-20250514-v1:0")
		})

		it("should distinguish between global and cross-region prefixes in ARNs", () => {
			// Test global inference ARN
			const globalHandler = createHandler({
				awsCustomArn:
					"arn:aws:bedrock:us-east-1:123456789012:inference-profile/global.anthropic.claude-sonnet-4-20250514-v1:0",
			})
			const globalModel = globalHandler.getModel()
			expect(globalModel.id).toBe("global.anthropic.claude-sonnet-4-20250514-v1:0")

			// Test cross-region inference ARN
			const crossRegionHandler = createHandler({
				awsCustomArn:
					"arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-3-sonnet-20240229-v1:0",
			})
			const crossRegionModel = crossRegionHandler.getModel()
			expect(crossRegionModel.id).toBe("us.anthropic.claude-3-sonnet-20240229-v1:0")
		})
	})

	describe("parseBaseModelId function", () => {
		it("should remove global. prefix from model IDs", () => {
			const handler = createHandler()
			const parseBaseModelId = (handler as any).parseBaseModelId.bind(handler)

			expect(parseBaseModelId("global.anthropic.claude-sonnet-4-20250514-v1:0")).toBe(
				"anthropic.claude-sonnet-4-20250514-v1:0",
			)
			expect(parseBaseModelId("global.anthropic.claude-opus-4-20250514-v1:0")).toBe(
				"anthropic.claude-opus-4-20250514-v1:0",
			)
		})

		it("should remove cross-region prefixes from model IDs", () => {
			const handler = createHandler()
			const parseBaseModelId = (handler as any).parseBaseModelId.bind(handler)

			expect(parseBaseModelId("us.anthropic.claude-3-sonnet-20240229-v1:0")).toBe(
				"anthropic.claude-3-sonnet-20240229-v1:0",
			)
			expect(parseBaseModelId("eu.anthropic.claude-3-sonnet-20240229-v1:0")).toBe(
				"anthropic.claude-3-sonnet-20240229-v1:0",
			)
			expect(parseBaseModelId("apac.anthropic.claude-3-sonnet-20240229-v1:0")).toBe(
				"anthropic.claude-3-sonnet-20240229-v1:0",
			)
		})

		it("should prioritize global. prefix removal over cross-region prefixes", () => {
			const handler = createHandler()
			const parseBaseModelId = (handler as any).parseBaseModelId.bind(handler)

			// Even if there's a model ID that somehow has both (shouldn't happen in practice),
			// global. should be removed first
			expect(parseBaseModelId("global.us.some-model-id")).toBe("us.some-model-id")
		})

		it("should return model ID unchanged if no prefix is present", () => {
			const handler = createHandler()
			const parseBaseModelId = (handler as any).parseBaseModelId.bind(handler)

			expect(parseBaseModelId("anthropic.claude-3-sonnet-20240229-v1:0")).toBe(
				"anthropic.claude-3-sonnet-20240229-v1:0",
			)
			expect(parseBaseModelId("amazon.nova-pro-v1:0")).toBe("amazon.nova-pro-v1:0")
		})
	})
})
