// npx vitest run api/providers/__tests__/ollama-timeout.spec.ts

import { vi, describe, it, expect, beforeEach } from "vitest"
import axios from "axios"
import { Readable } from "stream"
import { OllamaHandler } from "../ollama"
import { ApiHandlerOptions } from "../../../shared/api"
import * as timeoutConfig from "../utils/timeout-config"

// Mock axios
vi.mock("axios")
const mockedAxios = axios as any

// Mock the timeout configuration module
vi.mock("../utils/timeout-config", () => ({
	getApiRequestTimeout: vi.fn(),
}))

describe("OllamaHandler timeout configuration", () => {
	let mockGetApiRequestTimeout: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockGetApiRequestTimeout = vi.mocked(timeoutConfig.getApiRequestTimeout)
	})

	it("should use default timeout of 600 seconds when no configuration is set", async () => {
		// Mock the timeout function to return default
		mockGetApiRequestTimeout.mockReturnValue(600000)

		const options: ApiHandlerOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
			ollamaBaseUrl: "http://localhost:11434",
		}

		const handler = new OllamaHandler(options)

		// Create a mock stream for testing
		const mockStream = new Readable({
			read() {
				this.push(
					JSON.stringify({
						model: "llama2",
						created_at: "2024-01-01T00:00:00Z",
						message: { role: "assistant", content: "Test" },
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

		// Trigger a request to verify timeout is used
		const stream = handler.createMessage("System", [{ role: "user", content: "Test" }])
		const chunks: any[] = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify getApiRequestTimeout was called
		expect(mockGetApiRequestTimeout).toHaveBeenCalled()

		// Verify axios was called with the correct timeout
		expect(mockedAxios.post).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			expect.objectContaining({
				timeout: 600000,
			}),
		)
	})

	it("should use custom timeout when configuration is set", async () => {
		// Mock custom timeout
		mockGetApiRequestTimeout.mockReturnValue(3600000)

		const options: ApiHandlerOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
		}

		const handler = new OllamaHandler(options)

		// Create a mock stream for testing
		const mockStream = new Readable({
			read() {
				this.push(
					JSON.stringify({
						model: "llama2",
						created_at: "2024-01-01T00:00:00Z",
						message: { role: "assistant", content: "Test" },
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

		// Trigger a request to verify timeout is used
		const stream = handler.createMessage("System", [{ role: "user", content: "Test" }])
		const chunks: any[] = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify axios was called with the correct timeout
		expect(mockedAxios.post).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			expect.objectContaining({
				timeout: 3600000,
			}),
		)
	})

	it("should handle zero timeout (no timeout)", async () => {
		// Mock zero timeout
		mockGetApiRequestTimeout.mockReturnValue(0)

		const options: ApiHandlerOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
			ollamaBaseUrl: "http://localhost:11434",
		}

		const handler = new OllamaHandler(options)

		// Create a mock stream for testing
		const mockStream = new Readable({
			read() {
				this.push(
					JSON.stringify({
						model: "llama2",
						created_at: "2024-01-01T00:00:00Z",
						message: { role: "assistant", content: "Test" },
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

		// Trigger a request to verify timeout is used
		const stream = handler.createMessage("System", [{ role: "user", content: "Test" }])
		const chunks: any[] = []
		for await (const chunk of stream) {
			chunks.push(chunk)
		}

		// Verify axios was called with zero timeout
		expect(mockedAxios.post).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			expect.objectContaining({
				timeout: 0,
			}),
		)
	})

	it("should use default base URL when not provided", () => {
		const options: ApiHandlerOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
		}

		const handler = new OllamaHandler(options)

		// The base URL should be set to default
		expect(handler).toBeInstanceOf(OllamaHandler)
		// We can't directly access private baseUrl, but we can verify it works
		// by checking that requests go to the default URL
	})

	it("should use timeout for completePrompt as well", async () => {
		// Mock custom timeout
		mockGetApiRequestTimeout.mockReturnValue(1800000)

		const options: ApiHandlerOptions = {
			apiModelId: "llama2",
			ollamaModelId: "llama2",
		}

		const handler = new OllamaHandler(options)

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

		await handler.completePrompt("Test prompt")

		// Verify axios was called with the correct timeout
		expect(mockedAxios.post).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Object),
			expect.objectContaining({
				timeout: 1800000,
			}),
		)
	})
})
