import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as vscode from "vscode"
import axios from "axios"
import { SttService } from "../SttService"
import * as captureServer from "../capture-server"

// Mock vscode
vi.mock("vscode", () => ({
	env: {
		openExternal: vi.fn(),
		asExternalUri: vi.fn((uri: any) => Promise.resolve(uri)),
	},
	Uri: {
		parse: vi.fn((str: string) => ({ toString: () => str })),
	},
	ExtensionContext: vi.fn(),
}))

// Mock axios
vi.mock("axios")

// Mock capture server
vi.mock("../capture-server", () => ({
	getCaptureServer: vi.fn(() => ({
		getPort: vi.fn(() => null),
		start: vi.fn(() => Promise.resolve(3000)),
		stop: vi.fn(),
	})),
	stopCaptureServer: vi.fn(),
}))

describe("SttService", () => {
	let mockContext: any
	let mockProvider: any

	beforeEach(() => {
		vi.clearAllMocks()
		mockContext = {} as vscode.ExtensionContext
		mockProvider = {}
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe("initialization", () => {
		it("should create a new instance with context and provider", () => {
			const service = new SttService(mockContext, mockProvider)
			expect(service).toBeDefined()
		})

		it("should initialize with default config", () => {
			const service = new SttService(mockContext, mockProvider)
			// We can't directly access private config, but we can test behavior
			expect(service).toBeDefined()
		})
	})

	describe("updateConfig", () => {
		it("should update configuration", () => {
			const service = new SttService(mockContext, mockProvider)
			const config = {
				provider: "assemblyai" as const,
				apiKey: "test-key",
				autoStopTimeout: 3000,
				autoSend: true,
			}
			service.updateConfig(config)
			// Config is updated internally
			expect(service).toBeDefined()
		})
	})

	describe("getTemporaryToken", () => {
		let sttService: SttService

		beforeEach(() => {
			const config = {
				provider: "assemblyai" as const,
				apiKey: "test-api-key",
			}
			sttService = new SttService(mockContext, mockProvider)
			sttService.updateConfig(config)
		})

		it("should throw error if no API key is configured", async () => {
			sttService.updateConfig({ apiKey: undefined })
			await expect(sttService.getTemporaryToken()).rejects.toThrow("No API key configured for assemblyai")
		})

		it("should create AssemblyAI token successfully", async () => {
			const mockToken = "temp-token-123"
			vi.mocked(axios.post).mockResolvedValueOnce({
				data: { token: mockToken },
			})

			const token = await sttService.getTemporaryToken()
			expect(token).toBe(mockToken)
			expect(axios.post).toHaveBeenCalledWith(
				"https://api.assemblyai.com/v2/realtime/token",
				{ expires_in: 3600 },
				{ headers: { authorization: "test-api-key" } },
			)
		})

		it("should return cached token if still valid", async () => {
			const mockToken = "temp-token-123"
			vi.mocked(axios.post).mockResolvedValueOnce({
				data: { token: mockToken },
			})

			// First call creates token
			const token1 = await sttService.getTemporaryToken()
			// Second call should return cached token
			const token2 = await sttService.getTemporaryToken()

			expect(token1).toBe(token2)
			expect(axios.post).toHaveBeenCalledTimes(1)
		})

		it("should fallback to API key if token creation fails", async () => {
			vi.mocked(axios.post).mockRejectedValueOnce(new Error("API error"))

			const token = await sttService.getTemporaryToken()
			expect(token).toBe("test-api-key")
		})

		it("should throw error for unsupported provider", async () => {
			sttService.updateConfig({ provider: "openai-whisper" })
			await expect(sttService.getTemporaryToken()).rejects.toThrow("OpenAI Whisper provider not yet implemented")
		})
	})

	describe("startCapture", () => {
		let sttService: SttService

		beforeEach(() => {
			const config = {
				provider: "assemblyai" as const,
				apiKey: "test-api-key",
			}
			sttService = new SttService(mockContext, mockProvider)
			sttService.updateConfig(config)
		})

		it("should start capture and open browser", async () => {
			const mockToken = "temp-token-123"
			vi.mocked(axios.post).mockResolvedValueOnce({
				data: { token: mockToken },
			})

			const captureUrl = await sttService.startCapture()

			expect(captureUrl).toContain("http://localhost:3000/capture")
			expect(captureUrl).toContain(`token=${mockToken}`)
			expect(captureUrl).toContain("provider=assemblyai")
			expect(vscode.env.openExternal).toHaveBeenCalled()
		})

		it("should include configuration parameters in URL", async () => {
			const config = {
				provider: "assemblyai" as const,
				apiKey: "test-api-key",
				autoStopTimeout: 5000,
				autoSend: true,
			}
			sttService.updateConfig(config)

			const mockToken = "temp-token-123"
			vi.mocked(axios.post).mockResolvedValueOnce({
				data: { token: mockToken },
			})

			const captureUrl = await sttService.startCapture()

			expect(captureUrl).toContain("autoStopTimeout=5000")
			expect(captureUrl).toContain("autoSend=true")
		})
	})

	describe("stopCapture", () => {
		it("should emit stop event", () => {
			const sttService = new SttService(mockContext, mockProvider)
			const stopHandler = vi.fn()
			sttService.on("stop", stopHandler)

			sttService.stopCapture()

			expect(stopHandler).toHaveBeenCalled()
		})
	})

	describe("handleTranscript", () => {
		it("should emit transcript event with correct format", () => {
			const sttService = new SttService(mockContext, mockProvider)
			const transcriptHandler = vi.fn()
			sttService.on("transcript", transcriptHandler)

			const testTranscript = "Hello, this is a test"
			sttService.handleTranscript(testTranscript)

			expect(transcriptHandler).toHaveBeenCalledWith({
				text: testTranscript,
				isFinal: true,
			})
		})
	})

	describe("dispose", () => {
		it("should clean up resources when disposed", () => {
			const config = {
				provider: "assemblyai" as const,
				apiKey: "test-api-key",
			}
			const sttService = new SttService(mockContext, mockProvider)
			sttService.updateConfig(config)

			// Add a listener to verify cleanup
			const handler = vi.fn()
			sttService.on("test", handler)

			sttService.dispose()

			// Verify server is stopped
			expect(captureServer.stopCaptureServer).toHaveBeenCalled()

			// Verify listeners are removed
			sttService.emit("test")
			expect(handler).not.toHaveBeenCalled()
		})
	})
})
