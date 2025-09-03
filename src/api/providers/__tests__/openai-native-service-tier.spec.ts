// npx vitest run api/providers/__tests__/openai-native-service-tier.spec.ts

import { describe, it, expect, beforeEach, vi } from "vitest"
import { OpenAiNativeHandler } from "../openai-native"
import type { ApiHandlerOptions } from "../../../shared/api"
import type { Anthropic } from "@anthropic-ai/sdk"

// Capture request bodies passed to OpenAI.responses.create
const calledBodies: any[] = []
// Optional forced tier for mocking server-selected tier regardless of request
let forcedTier: string | undefined

// Helper to build a single "response.completed" event with usage and optional service tier
function makeCompletedEvent(serviceTier?: string) {
	return {
		type: "response.completed",
		response: {
			id: "resp_123",
			service_tier: serviceTier,
			usage: {
				input_tokens: 1000,
				output_tokens: 100,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			},
			// minimal output for completeness (not used in assertions)
			output: [],
		},
	}
}

// Mock OpenAI SDK's Responses API
vi.mock("openai", () => {
	const mockConstructor = vi.fn()
	return {
		__esModule: true,
		default: mockConstructor.mockImplementation(() => ({
			responses: {
				create: vi.fn(async (body: any) => {
					calledBodies.push(body)

					// Non-streaming path used by completePrompt()
					if (body && body.stream === false) {
						return {
							id: "non_stream_resp",
							output: [
								{
									type: "message",
									content: [{ type: "output_text", text: "Non-stream response" }],
								},
							],
						}
					}

					// Streaming path: yield a single completed event with usage
					const resolvedTier = forcedTier ?? body?.service_tier ?? undefined
					return {
						[Symbol.asyncIterator]: async function* () {
							yield makeCompletedEvent(resolvedTier)
						},
					}
				}),
			},
		})),
	}
})

describe("OpenAiNativeHandler - service tier + pricing", () => {
	beforeEach(() => {
		calledBodies.length = 0
	})

	const systemPrompt = "You are helpful."
	const messages: Anthropic.Messages.MessageParam[] = [
		{ role: "user", content: [{ type: "text", text: "Hello!" }] as any },
	]

	it("includes service_tier=priority for gpt-5 and computes priority pricing", async () => {
		const handler = new OpenAiNativeHandler({
			apiModelId: "gpt-5-2025-08-07",
			openAiNativeApiKey: "test",
			openAiNativeServiceTier: "priority",
		} as ApiHandlerOptions)

		const chunks: any[] = []
		for await (const chunk of handler.createMessage(systemPrompt, messages)) {
			chunks.push(chunk)
		}

		// Verify service_tier sent
		expect(calledBodies[0].service_tier).toBe("priority")

		// Verify cost uses priority pricing (input $2.50/M, output $20.00/M)
		// 1000 in, 100 out -> 0.0025 + 0.002 = 0.0045
		const usageChunk = chunks.find((c) => c.type === "usage")
		expect(usageChunk).toBeDefined()
		expect(usageChunk.totalCost).toBeCloseTo(0.0045, 10)
	})

	it("omits unsupported 'flex' on gpt-4.1 and uses default pricing", async () => {
		const handler = new OpenAiNativeHandler({
			apiModelId: "gpt-4.1",
			openAiNativeApiKey: "test",
			// gpt-4.1 only supports priority; 'flex' should be omitted by provider
			openAiNativeServiceTier: "flex",
		} as ApiHandlerOptions)

		const chunks: any[] = []
		for await (const chunk of handler.createMessage(systemPrompt, messages)) {
			chunks.push(chunk)
		}

		// No service_tier should be present in request body for unsupported tier
		expect(calledBodies[0].service_tier).toBeUndefined()

		// Default pricing for gpt-4.1: input $2.00/M, output $8.00/M
		// 1000 in, 100 out -> 0.002 + 0.0008 = 0.0028
		const usageChunk = chunks.find((c) => c.type === "usage")
		expect(usageChunk).toBeDefined()
		expect(usageChunk.totalCost).toBeCloseTo(0.0028, 10)
	})

	it("uses actual service_tier from API response when none requested (e.g., o3 priority)", async () => {
		// Simulate server selecting 'priority' even though we did not request a tier.
		forcedTier = "priority"
		const handler = new OpenAiNativeHandler({
			apiModelId: "o3",
			openAiNativeApiKey: "test",
			// intentionally no openAiNativeServiceTier requested
		} as ApiHandlerOptions)

		const chunks: any[] = []
		for await (const chunk of handler.createMessage(systemPrompt, messages)) {
			chunks.push(chunk)
		}

		// Body should not request a tier
		expect(calledBodies[0].service_tier).toBeUndefined()

		// But usage should reflect priority prices for o3: input $3.50/M, output $14.00/M
		// 1000 in, 100 out -> 0.0035 + 0.0014 = 0.0049
		const usageChunk = chunks.find((c) => c.type === "usage")
		expect(usageChunk).toBeDefined()
		expect(usageChunk.totalCost).toBeCloseTo(0.0049, 10)

		// Reset forced tier
		forcedTier = undefined
	})

	it("passes service_tier for non-streaming completePrompt()", async () => {
		const handler = new OpenAiNativeHandler({
			apiModelId: "o4-mini",
			openAiNativeApiKey: "test",
			openAiNativeServiceTier: "flex",
		} as ApiHandlerOptions)

		const text = await handler.completePrompt("Say hi")
		expect(text).toBe("Non-stream response")

		// Last call should be non-streaming and include service_tier:flex
		const lastBody = calledBodies[calledBodies.length - 1]
		expect(lastBody.stream).toBe(false)
		expect(lastBody.service_tier).toBe("flex")
	})
})
