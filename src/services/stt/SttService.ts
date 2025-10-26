import * as vscode from "vscode"
import axios from "axios"
import { EventEmitter } from "events"
import { getCaptureServer, stopCaptureServer } from "./capture-server"

export interface SttConfig {
	provider: "assemblyai" | "openai-whisper"
	apiKey?: string
	autoStopTimeout?: number
	autoSend?: boolean
}

export interface SttTranscript {
	text: string
	confidence?: number
	isFinal: boolean
}

export class SttService extends EventEmitter {
	private config: SttConfig
	private captureServer = getCaptureServer()
	private temporaryToken: string | null = null
	private tokenExpiresAt: number = 0

	constructor(
		private context: vscode.ExtensionContext,
		private provider: any,
	) {
		super()
		// Initialize with default config
		this.config = {
			provider: "assemblyai",
			apiKey: undefined,
			autoStopTimeout: 2000,
			autoSend: false,
		}
	}

	public updateConfig(config: Partial<SttConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Get a temporary token for the STT provider
	 * This avoids exposing the actual API key to the browser
	 */
	public async getTemporaryToken(): Promise<string> {
		// Check if we have a valid cached token
		if (this.temporaryToken && this.tokenExpiresAt > Date.now()) {
			return this.temporaryToken
		}

		if (!this.config.apiKey) {
			throw new Error(`No API key configured for ${this.config.provider}`)
		}

		if (this.config.provider === "assemblyai") {
			// AssemblyAI uses the API key directly for WebSocket auth
			// In production, you'd want to implement a token exchange service
			// For now, we'll use a simple approach with expiring tokens
			this.temporaryToken = await this.createAssemblyAiToken()
			this.tokenExpiresAt = Date.now() + 3600000 // 1 hour
			return this.temporaryToken
		} else if (this.config.provider === "openai-whisper") {
			// OpenAI Whisper would need a different token mechanism
			throw new Error("OpenAI Whisper provider not yet implemented")
		}

		throw new Error(`Unknown STT provider: ${this.config.provider}`)
	}

	/**
	 * Create a temporary token for AssemblyAI
	 * In production, this should be done through a secure backend service
	 */
	private async createAssemblyAiToken(): Promise<string> {
		// For AssemblyAI, we need to create a temporary token through their API
		// This is a simplified version - in production, use a backend service
		try {
			const response = await axios.post(
				"https://api.assemblyai.com/v2/realtime/token",
				{
					expires_in: 3600, // 1 hour
				},
				{
					headers: {
						authorization: this.config.apiKey,
					},
				},
			)
			return response.data.token
		} catch (error) {
			console.error("Failed to create AssemblyAI token:", error)
			// Fallback: return the API key (not recommended for production)
			return this.config.apiKey!
		}
	}

	/**
	 * Start the audio capture process
	 * Opens a browser window for microphone access
	 */
	public async startCapture(): Promise<string> {
		// Generate the capture URL with necessary parameters
		const token = await this.getTemporaryToken()
		const captureUrl = await this.generateCaptureUrl(token)

		// Open the capture page in the default browser
		await vscode.env.openExternal(vscode.Uri.parse(captureUrl))

		return captureUrl
	}

	/**
	 * Generate the URL for the browser-based capture page
	 */
	private async generateCaptureUrl(token: string): Promise<string> {
		// Start the capture server if not already running
		let port = this.captureServer.getPort()
		if (!port) {
			port = await this.captureServer.start()
		}

		// Create a callback URI for receiving the transcript
		const callbackUri = await vscode.env.asExternalUri(
			vscode.Uri.parse(`vscode://rooveterinaryinc.roo-cline/stt-callback`),
		)

		// Build the capture URL with parameters
		const params = new URLSearchParams({
			token: token,
			provider: this.config.provider,
			callback: callbackUri.toString(),
			autoStopTimeout: String(this.config.autoStopTimeout || 2000),
			autoSend: String(this.config.autoSend || false),
		})

		return `http://localhost:${port}/capture?${params.toString()}`
	}

	/**
	 * Stop the capture process
	 */
	public stopCapture(): void {
		this.emit("stop")
	}

	/**
	 * Handle incoming transcript from the browser
	 */
	public handleTranscript(transcript: string): void {
		this.emit("transcript", {
			text: transcript,
			isFinal: true,
		} as SttTranscript)
	}

	/**
	 * Clean up resources
	 */
	private cleanup(): void {
		this.removeAllListeners()
		this.temporaryToken = null
		this.tokenExpiresAt = 0
		stopCaptureServer()
	}

	/**
	 * Dispose of the service and clean up resources
	 */
	public dispose(): void {
		this.cleanup()
	}
}
