import { describe, it, expect } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import type { ModelInfo } from "@roo-code/types"
import type { ApiMessage } from "../../task-persistence"
import { countImagesInConversation, trimImagesFromConversation, wouldExceedImageLimit } from "../image-limit-handler"

describe("image-limit-handler", () => {
	describe("countImagesInConversation", () => {
		it("should count images in conversation correctly", () => {
			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Hello" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
					],
					ts: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "I see your image" }],
					ts: Date.now(),
				},
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data3" } },
						{ type: "text", text: "Here are two more images" },
					],
					ts: Date.now(),
				},
			]

			const count = countImagesInConversation(messages)
			expect(count).toBe(3)
		})

		it("should return 0 when no images in conversation", () => {
			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [{ type: "text", text: "Hello" }],
					ts: Date.now(),
				},
				{
					role: "assistant",
					content: [{ type: "text", text: "Hi there" }],
					ts: Date.now(),
				},
			]

			const count = countImagesInConversation(messages)
			expect(count).toBe(0)
		})

		it("should handle messages with string content", () => {
			const messages: ApiMessage[] = [
				{
					role: "user",
					content: "Simple text message",
					ts: Date.now(),
				},
				{
					role: "assistant",
					content: "Response",
					ts: Date.now(),
				},
			]

			const count = countImagesInConversation(messages)
			expect(count).toBe(0)
		})
	})

	describe("trimImagesFromConversation", () => {
		it("should trim oldest images when exceeding limit", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 2,
				supportsPromptCache: true,
			}

			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "First message" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
					],
					ts: Date.now(),
				},
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
						{ type: "text", text: "Second message" },
					],
					ts: Date.now(),
				},
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data3" } },
						{ type: "text", text: "Third message" },
					],
					ts: Date.now(),
				},
			]

			const result = trimImagesFromConversation(messages, modelInfo)

			expect(result.trimmedCount).toBe(1)
			expect(result.warningMessage).toContain("Removed 1 image(s)")
			expect(countImagesInConversation(result.messages)).toBe(2)

			// Check that the first image was replaced with a placeholder
			const firstMessage = result.messages[0]
			if (Array.isArray(firstMessage.content)) {
				const hasPlaceholder = firstMessage.content.some(
					(block) => block.type === "text" && block.text.includes("[Image removed"),
				)
				expect(hasPlaceholder).toBe(true)
			}
		})

		it("should not trim when within limit", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 5,
				supportsPromptCache: true,
			}

			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Message" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
					],
					ts: Date.now(),
				},
			]

			const result = trimImagesFromConversation(messages, modelInfo)

			expect(result.trimmedCount).toBe(0)
			expect(result.warningMessage).toBeUndefined()
			expect(result.messages).toEqual(messages)
		})

		it("should handle model without image support", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: false,
				supportsPromptCache: true,
			}

			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } }],
					ts: Date.now(),
				},
			]

			const result = trimImagesFromConversation(messages, modelInfo)

			expect(result.trimmedCount).toBe(0)
			expect(result.messages).toEqual(messages)
		})

		it("should handle model without maxImages defined", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				supportsPromptCache: true,
				// maxImages not defined
			}

			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
					],
					ts: Date.now(),
				},
			]

			const result = trimImagesFromConversation(messages, modelInfo)

			expect(result.trimmedCount).toBe(0)
			expect(result.messages).toEqual(messages)
		})

		it("should trim multiple images and preserve text content", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 1,
				supportsPromptCache: true,
			}

			const messages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Here are images:" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
						{ type: "text", text: "What do you see?" },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data3" } },
					],
					ts: Date.now(),
				},
			]

			const result = trimImagesFromConversation(messages, modelInfo)

			expect(result.trimmedCount).toBe(2)
			expect(countImagesInConversation(result.messages)).toBe(1)

			// Check that text content is preserved
			const firstMessage = result.messages[0]
			if (Array.isArray(firstMessage.content)) {
				const textBlocks = firstMessage.content.filter((block) => block.type === "text")
				const hasOriginalText = textBlocks.some((block) => block.text.includes("Here are images:"))
				const hasQuestionText = textBlocks.some((block) => block.text.includes("What do you see?"))
				expect(hasOriginalText).toBe(true)
				expect(hasQuestionText).toBe(true)
			}
		})
	})

	describe("wouldExceedImageLimit", () => {
		it("should detect when adding content would exceed limit", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 3,
				supportsPromptCache: true,
			}

			const currentMessages: ApiMessage[] = [
				{
					role: "user",
					content: [
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } },
						{ type: "image", source: { type: "base64", media_type: "image/png", data: "data2" } },
					],
					ts: Date.now(),
				},
			]

			const newContent: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "image" as const,
					source: { type: "base64" as const, media_type: "image/png" as const, data: "data3" },
				},
				{
					type: "image" as const,
					source: { type: "base64" as const, media_type: "image/png" as const, data: "data4" },
				},
			]

			const result = wouldExceedImageLimit(currentMessages, newContent, modelInfo)
			expect(result).toBe(true)
		})

		it("should return false when within limit", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 5,
				supportsPromptCache: true,
			}

			const currentMessages: ApiMessage[] = [
				{
					role: "user",
					content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } }],
					ts: Date.now(),
				},
			]

			const newContent: Anthropic.Messages.ContentBlockParam[] = [
				{
					type: "image" as const,
					source: { type: "base64" as const, media_type: "image/png" as const, data: "data2" },
				},
			]

			const result = wouldExceedImageLimit(currentMessages, newContent, modelInfo)
			expect(result).toBe(false)
		})

		it("should handle text-only content", () => {
			const modelInfo: ModelInfo = {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				maxImages: 1,
				supportsPromptCache: true,
			}

			const currentMessages: ApiMessage[] = [
				{
					role: "user",
					content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "data1" } }],
					ts: Date.now(),
				},
			]

			const newContent: Anthropic.Messages.ContentBlockParam[] = [
				{ type: "text" as const, text: "Just text, no images" },
			]

			const result = wouldExceedImageLimit(currentMessages, newContent, modelInfo)
			expect(result).toBe(false)
		})
	})
})
