// npx vitest run api/providers/__tests__/ollama.spec.ts

import { vi, describe, it, expect, beforeEach } from "vitest"
import { Anthropic } from "@anthropic-ai/sdk"
import axios from "axios"
import { Readable } from "stream"

import { OllamaHandler } from "../ollama"
import { ApiHandlerOptions } from "../../../shared/api"

// Mock axios
vi.mock("axios")
const mockedAxios = axios as any

describe("OllamaHandler", () => {
	let handler: OllamaHandler
	let mockOptions: ApiHandlerOptions

	beforeEach(() => {
		mockOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
			ollamaBaseUrl: "http://localhost:11434",
		}
		handler = new OllamaHandler(mockOptions)
		vi.clearAllMocks()
	})

	describe("constructor", () => {
		it("should initialize with provided options", () => {
			expect(handler).toBeInstanceOf(OllamaHandler)
			expect(handler.getModel().id).toBe(mockOptions.ollamaModelId)
		})

		it("should use default base URL if not provided", () => {
			const handlerWithoutUrl = new OllamaHandler({
				apiModelId: "llama2",
				ollamaModelId: "llama2",
			})
			expect(handlerWithoutUrl).toBeInstanceOf(OllamaHandler)
		})
	})

	describe("createMessage", () => {
		const systemPrompt = "You are a helpful assistant."
		const messages: Anthropic.Messages.MessageParam[] = [
			{
				role: "user",
				content: "Hello!",
			},
		]

		it("should handle streaming responses", async () => {
			// Create a mock readable stream
			const mockStreamData = [
				JSON.stringify({
					model: "llama2",
					created_at: "2024-01-01T00:00:00Z",
					message: { role: "assistant", content: "Test " },
					done: false,
				}),
				JSON.stringify({
					model: "llama2",
					created_at: "2024-01-01T00:00:01Z",
					message: { role: "assistant", content: "response" },
					done: false,
				}),
				JSON.stringify({
					model: "llama2",
					created_at: "2024-01-01T00:00:02Z",
					done: true,
					prompt_eval_count: 10,
					eval_count: 5,
				}),
			]

			const mockStream = new Readable({
				read() {
					if (mockStreamData.length > 0) {
						this.push(mockStreamData.shift() + "\n")
					} else {
						this.push(null)
					}
				},
			})

			mockedAxios.post.mockResolvedValueOnce({
				data: mockStream,
				status: 200,
				statusText: "OK",
				headers: {},
				config: {} as any,
			})

			const stream = handler.createMessage(systemPrompt, messages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			expect(chunks.length).toBeGreaterThan(0)
			const textChunks = chunks.filter((chunk) => chunk.type === "text")
			expect(textChunks).toHaveLength(2)
			expect(textChunks[0].text).toBe("Test ")
			expect(textChunks[1].text).toBe("response")

			// Check usage information
			const usageChunks = chunks.filter((chunk) => chunk.type === "usage")
			expect(usageChunks).toHaveLength(1)
			expect(usageChunks[0].inputTokens).toBe(10)
			expect(usageChunks[0].outputTokens).toBe(5)

			// Verify the API was called with correct endpoint and data
			expect(mockedAxios.post).toHaveBeenCalledWith(
				"http://localhost:11434/api/chat",
				{
					model: "llama2",
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: "Hello!" },
					],
					stream: true,
					options: {
						temperature: 0,
					},
				},
				expect.objectContaining({
					responseType: "stream",
					headers: {
						"Content-Type": "application/json",
					},
				}),
			)
		})

		it("should handle API errors", async () => {
			const error = new Error("API Error")
			;(error as any).code = "ECONNREFUSED"
			mockedAxios.isAxiosError = vi.fn().mockReturnValue(true)
			mockedAxios.post.mockRejectedValueOnce(error)

			const stream = handler.createMessage(systemPrompt, messages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Ollama service is not running")
		})

		it("should handle model not found errors", async () => {
			const error = new Error("Not Found")
			;(error as any).response = { status: 404 }
			mockedAxios.isAxiosError = vi.fn().mockReturnValue(true)
			mockedAxios.post.mockRejectedValueOnce(error)

			const stream = handler.createMessage(systemPrompt, messages)

			await expect(async () => {
				for await (const _chunk of stream) {
					// Should not reach here
				}
			}).rejects.toThrow("Model llama2 not found in Ollama")
		})
	})

	describe("completePrompt", () => {
		it("should complete prompt successfully", async () => {
			mockedAxios.post.mockResolvedValueOnce({
				data: {
					model: "llama2",
					created_at: "2024-01-01T00:00:00Z",
					message: {
						role: "assistant",
						content: "Test response",
					},
					done: true,
				},
				status: 200,
				statusText: "OK",
				headers: {},
				config: {} as any,
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("Test response")
			expect(mockedAxios.post).toHaveBeenCalledWith(
				"http://localhost:11434/api/chat",
				{
					model: mockOptions.ollamaModelId,
					messages: [{ role: "user", content: "Test prompt" }],
					stream: false,
					options: {
						temperature: 0,
					},
				},
				expect.objectContaining({
					headers: {
						"Content-Type": "application/json",
					},
				}),
			)
		})

		it("should handle API errors", async () => {
			const error = new Error("API Error")
			;(error as any).code = "ECONNREFUSED"
			mockedAxios.isAxiosError = vi.fn().mockReturnValue(true)
			mockedAxios.post.mockRejectedValueOnce(error)

			await expect(handler.completePrompt("Test prompt")).rejects.toThrow(
				"Ollama service is not running at http://localhost:11434",
			)
		})

		it("should handle empty response", async () => {
			mockedAxios.post.mockResolvedValueOnce({
				data: {
					model: "llama2",
					created_at: "2024-01-01T00:00:00Z",
					message: {
						role: "assistant",
						content: "",
					},
					done: true,
				},
				status: 200,
				statusText: "OK",
				headers: {},
				config: {} as any,
			})

			const result = await handler.completePrompt("Test prompt")
			expect(result).toBe("")
		})
	})

	describe("getModel", () => {
		it("should return model info", () => {
			const modelInfo = handler.getModel()
			expect(modelInfo.id).toBe(mockOptions.ollamaModelId)
			expect(modelInfo.info).toBeDefined()
			expect(modelInfo.info.maxTokens).toBe(-1)
			expect(modelInfo.info.contextWindow).toBe(128_000)
		})
	})

	describe("message format conversion", () => {
		it("should handle complex message content", async () => {
			const complexMessages: Anthropic.Messages.MessageParam[] = [
				{
					role: "user",
					content: [
						{ type: "text", text: "Here is an image:" },
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "base64data",
							},
						},
					],
				},
			]

			const mockStream = new Readable({
				read() {
					this.push(
						JSON.stringify({
							model: "llama2",
							created_at: "2024-01-01T00:00:00Z",
							message: { role: "assistant", content: "I see the image" },
							done: true,
						}) + "\n",
					)
					this.push(null)
				},
			})

			mockedAxios.post.mockResolvedValueOnce({
				data: mockStream,
				status: 200,
				statusText: "OK",
				headers: {},
				config: {} as any,
			})

			const stream = handler.createMessage("System prompt", complexMessages)
			const chunks: any[] = []
			for await (const chunk of stream) {
				chunks.push(chunk)
			}

			// Verify the message was properly converted
			expect(mockedAxios.post).toHaveBeenCalledWith(
				"http://localhost:11434/api/chat",
				expect.objectContaining({
					messages: expect.arrayContaining([
						expect.objectContaining({
							role: "user",
							content: "Here is an image:",
							images: ["base64data"],
						}),
					]),
				}),
				expect.any(Object),
			)
		})
	})
})
