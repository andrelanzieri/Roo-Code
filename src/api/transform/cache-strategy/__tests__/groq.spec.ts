// npx vitest run src/api/transform/cache-strategy/__tests__/groq.spec.ts

import { Anthropic } from "@anthropic-ai/sdk"
import { GroqCacheStrategy } from "../groq"
import { CacheStrategyConfig } from "../types"

describe("GroqCacheStrategy", () => {
	const createConfig = (overrides?: Partial<CacheStrategyConfig>): CacheStrategyConfig => ({
		modelInfo: {
			maxTokens: 8192,
			contextWindow: 131072,
			supportsPromptCache: true,
			maxCachePoints: 4,
			minTokensPerCachePoint: 1024,
			cachableFields: ["system", "messages"],
		},
		systemPrompt: "Test system prompt",
		messages: [],
		usePromptCache: true,
		...overrides,
	})

	describe("determineOptimalCachePoints", () => {
		it("should return formatted messages without explicit cache points", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.determineOptimalCachePoints()

			// Should have system blocks
			expect(result.system).toHaveLength(1)
			expect(result.system[0]).toHaveProperty("text", "Test system prompt")

			// Should have messages
			expect(result.messages).toHaveLength(2)
		})

		it("should track virtual cache points for monitoring", () => {
			// Create a message that's long enough to meet the 1024 token threshold
			// Approximately 4 characters per token, so we need ~4096 characters
			const longMessage = "This is a very long message that needs to meet the token threshold. ".repeat(100)

			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Short first message" },
				{ role: "assistant", content: "Response" },
				{ role: "user", content: longMessage }, // This should meet the threshold
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.determineOptimalCachePoints()

			// Should track the last user message as a virtual cache point if it meets threshold
			expect(result.messageCachePointPlacements).toBeDefined()
			expect(result.messageCachePointPlacements).toHaveLength(1)
			expect(result.messageCachePointPlacements![0]).toMatchObject({
				index: 2, // Last user message
				type: "message",
			})
		})

		it("should not add cache points when caching is disabled", () => {
			const longMessage = "This is a very long message that needs to meet the token threshold. ".repeat(100)
			const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: longMessage }]

			const config = createConfig({ messages, usePromptCache: false })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.determineOptimalCachePoints()

			// Should not track any cache points when caching is disabled
			expect(result.messageCachePointPlacements).toHaveLength(0)
		})
	})

	describe("convertToOpenAIFormat", () => {
		it("should convert simple messages correctly", () => {
			const systemPrompt = "System prompt"
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "Hello" },
				{ role: "assistant", content: "Hi there" },
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.convertToOpenAIFormat(systemPrompt, messages)

			expect(result).toHaveLength(3)
			expect(result[0]).toEqual({ role: "system", content: systemPrompt })
			expect(result[1]).toEqual({ role: "user", content: "Hello" })
			expect(result[2]).toEqual({ role: "assistant", content: "Hi there" })
		})

		it("should handle multi-part content", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Part 1" },
						{ type: "text", text: "Part 2" },
					],
				},
				{
					role: "assistant",
					content: [
						{ type: "text", text: "Response 1" },
						{ type: "text", text: "Response 2" },
					],
				},
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.convertToOpenAIFormat(undefined, messages)

			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ role: "user", content: "Part 1\nPart 2" })
			expect(result[1]).toEqual({ role: "assistant", content: "Response 1\nResponse 2" })
		})

		it("should include empty messages", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{ role: "user", content: "" },
				{ role: "assistant", content: "Response" },
				{ role: "user", content: [] }, // Empty array
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.convertToOpenAIFormat(undefined, messages)

			// Groq strategy includes empty messages (OpenAI API will handle them)
			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({ role: "user", content: "" })
			expect(result[1]).toEqual({ role: "assistant", content: "Response" })
		})

		it("should handle system prompt correctly", () => {
			const systemPrompt = "System instructions"
			const messages: Anthropic.Messages.MessageParam[] = []

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.convertToOpenAIFormat(systemPrompt, messages)

			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({ role: "system", content: systemPrompt })
		})

		it("should filter out non-text content types", () => {
			const messages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Text content" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "..." } } as any,
					],
				},
			]

			const config = createConfig({ messages })
			const strategy = new GroqCacheStrategy(config)
			const result = strategy.convertToOpenAIFormat(undefined, messages)

			// Should only include text content
			expect(result).toHaveLength(1)
			expect(result[0]).toEqual({ role: "user", content: "Text content" })
		})
	})
})
