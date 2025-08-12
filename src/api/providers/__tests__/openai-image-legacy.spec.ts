// npx vitest run api/providers/__tests__/openai-image-legacy.spec.ts

import { OpenAiHandler } from "../openai"
import { ApiHandlerOptions } from "../../../shared/api"
import { Anthropic } from "@anthropic-ai/sdk"
import OpenAI from "openai"

const mockCreate = vitest.fn()

vitest.mock("openai", () => {
	const mockConstructor = vitest.fn()
	return {
		__esModule: true,
		default: mockConstructor.mockImplementation(() => ({
			chat: {
				completions: {
					create: mockCreate.mockImplementation(async (options) => {
						if (!options.stream) {
							return {
								id: "test-completion",
								choices: [
									{
										message: { role: "assistant", content: "I can see the image", refusal: null },
										finish_reason: "stop",
										index: 0,
									},
								],
								usage: {
									prompt_tokens: 10,
									completion_tokens: 5,
									total_tokens: 15,
								},
							}
						}

						return {
							[Symbol.asyncIterator]: async function* () {
								yield {
									choices: [
										{
											delta: { content: "I can see the image" },
											index: 0,
										},
									],
									usage: null,
								}
								yield {
									choices: [
										{
											delta: {},
											index: 0,
										},
									],
									usage: {
										prompt_tokens: 10,
										completion_tokens: 5,
										total_tokens: 15,
									},
								}
							},
						}
					}),
				},
			},
		})),
	}
})

describe("OpenAiHandler - Image Handling with Legacy Format", () => {
	let handler: OpenAiHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			openAiApiKey: "test-api-key",
			openAiModelId: "gpt-4-vision-preview",
			openAiBaseUrl: "https://api.openai.com/v1",
			openAiLegacyFormat: true, // Enable legacy format
		}
		handler = new OpenAiHandler(mockOptions)
		mockCreate.mockClear()
	})

	describe("Image handling with legacy format enabled", () => {
		const systemPrompt = "You are a helpful assistant that can analyze images."

		it("should preserve images in messages when legacy format is enabled", async () => {
			const messagesWithImage: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text" as const,
							text: "What's in this image?",
						},
						{
							type: "image" as const,
							source: {
								type: "base64" as const,
								media_type: "image/png",
								data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
							},
						},
					],
				},
			]

			const stream = handler.createMessage(systemPrompt, messagesWithImage)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the API was called
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]

			// Check that messages were properly formatted with image data preserved
			expect(callArgs.messages).toBeDefined()
			expect(callArgs.messages.length).toBeGreaterThan(0)

			// Find the user message with the image
			const userMessage = callArgs.messages.find((msg: any) => msg.role === "user" && Array.isArray(msg.content))
			expect(userMessage).toBeDefined()

			// Verify the image content is preserved in OpenAI format
			const imageContent = userMessage.content.find((part: any) => part.type === "image_url")
			expect(imageContent).toBeDefined()
			expect(imageContent.image_url).toBeDefined()
			expect(imageContent.image_url.url).toContain("data:image/png;base64,")
			expect(imageContent.image_url.url).toContain(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
			)
		})

		it("should use simple format for text-only messages when legacy format is enabled", async () => {
			const textOnlyMessages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "Hello, how are you?",
				},
			]

			const stream = handler.createMessage(systemPrompt, textOnlyMessages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the API was called
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]

			// Check that messages were formatted as simple strings for text-only content
			expect(callArgs.messages).toBeDefined()
			expect(callArgs.messages.length).toBeGreaterThan(0)

			// Find the user message
			const userMessage = callArgs.messages.find(
				(msg: any) => msg.role === "user" && msg.content === "Hello, how are you?",
			)
			expect(userMessage).toBeDefined()
			expect(typeof userMessage.content).toBe("string")
		})

		it("should handle mixed messages with and without images correctly", async () => {
			const mixedMessages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: "First message without image",
				},
				{
					role: "assistant",
					content: "I understand",
				},
				{
					role: "user",
					content: [
						{
							type: "text" as const,
							text: "Now here's an image",
						},
						{
							type: "image" as const,
							source: {
								type: "base64" as const,
								media_type: "image/jpeg",
								data: "base64imagedata",
							},
						},
					],
				},
			]

			const stream = handler.createMessage(systemPrompt, mixedMessages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the API was called
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]

			// Since there's an image in the messages, all messages should use OpenAI format
			expect(callArgs.messages).toBeDefined()

			// Find the user message with the image
			const userMessageWithImage = callArgs.messages.find(
				(msg: any) =>
					msg.role === "user" &&
					Array.isArray(msg.content) &&
					msg.content.some((part: any) => part.type === "image_url"),
			)
			expect(userMessageWithImage).toBeDefined()

			// Verify the image is properly formatted
			const imageContent = userMessageWithImage.content.find((part: any) => part.type === "image_url")
			expect(imageContent.image_url.url).toContain("data:image/jpeg;base64,base64imagedata")
		})

		it("should handle non-streaming mode with images and legacy format", async () => {
			const handler = new OpenAiHandler({
				...mockOptions,
				openAiStreamingEnabled: false,
			})

			const messagesWithImage: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text" as const,
							text: "Analyze this",
						},
						{
							type: "image" as const,
							source: {
								type: "base64" as const,
								media_type: "image/gif",
								data: "gifbase64data",
							},
						},
					],
				},
			]

			const stream = handler.createMessage(systemPrompt, messagesWithImage)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the API was called
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]

			// Verify streaming is disabled
			expect(callArgs.stream).toBeUndefined()

			// Find the user message with the image
			const userMessage = callArgs.messages.find((msg: any) => msg.role === "user" && Array.isArray(msg.content))
			expect(userMessage).toBeDefined()

			// Verify the image content is preserved
			const imageContent = userMessage.content.find((part: any) => part.type === "image_url")
			expect(imageContent).toBeDefined()
			expect(imageContent.image_url.url).toContain("data:image/gif;base64,gifbase64data")
		})
	})

	describe("Image handling without legacy format", () => {
		beforeEach(() => {
			mockOptions = {
				openAiApiKey: "test-api-key",
				openAiModelId: "gpt-4-vision-preview",
				openAiBaseUrl: "https://api.openai.com/v1",
				openAiLegacyFormat: false, // Disable legacy format
			}
			handler = new OpenAiHandler(mockOptions)
			mockCreate.mockClear()
		})

		it("should properly handle images when legacy format is disabled", async () => {
			const messagesWithImage: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{
							type: "text" as const,
							text: "What's in this image?",
						},
						{
							type: "image" as const,
							source: {
								type: "base64" as const,
								media_type: "image/png",
								data: "testImageData",
							},
						},
					],
				},
			]

			const stream = handler.createMessage("System prompt", messagesWithImage)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the API was called
			expect(mockCreate).toHaveBeenCalled()
			const callArgs = mockCreate.mock.calls[0][0]

			// Check that messages use OpenAI format with images preserved
			const userMessage = callArgs.messages.find((msg: any) => msg.role === "user" && Array.isArray(msg.content))
			expect(userMessage).toBeDefined()

			// Verify the image content is preserved
			const imageContent = userMessage.content.find((part: any) => part.type === "image_url")
			expect(imageContent).toBeDefined()
			expect(imageContent.image_url.url).toContain("data:image/png;base64,testImageData")
		})
	})
})
