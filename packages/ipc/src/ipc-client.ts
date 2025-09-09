import EventEmitter from "node:events"
import * as crypto from "node:crypto"

import ipc from "node-ipc"

import {
	type TaskCommand,
	type IpcClientEvents,
	type IpcMessage,
	IpcOrigin,
	IpcMessageType,
	ipcMessageSchema,
} from "@roo-code/types"

// Configuration for headless environments
const HEADLESS_CONFIG = {
	// Increase retry attempts for headless environments
	maxRetries: 10,
	// Increase retry delay for slower environments
	retryDelay: 1000,
	// Connection timeout for headless environments (ms)
	connectionTimeout: 30000,
	// Enable verbose logging in headless mode
	verboseLogging: process.env.DISPLAY === ":99" || process.env.XVFB_DISPLAY !== undefined,
}

export class IpcClient extends EventEmitter<IpcClientEvents> {
	private readonly _socketPath: string
	private readonly _id: string
	private readonly _log: (...args: unknown[]) => void
	private _isConnected = false
	private _clientId?: string
	private _connectionTimeout?: NodeJS.Timeout
	private _shutdownInProgress = false
	private _reconnectAttempts = 0

	constructor(socketPath: string, log = console.log) {
		super()

		this._socketPath = socketPath
		this._id = `roo-code-evals-${crypto.randomBytes(6).toString("hex")}`
		this._log = log

		// Configure IPC for headless environments
		ipc.config.silent = true
		ipc.config.retry = HEADLESS_CONFIG.retryDelay
		ipc.config.maxRetries = HEADLESS_CONFIG.maxRetries
		ipc.config.stopRetrying = false

		this.setupConnection()
		this.setupShutdownHandlers()
	}

	private setupConnection() {
		try {
			ipc.connectTo(this._id, this.socketPath, () => {
				ipc.of[this._id]?.on("connect", () => this.onConnect())
				ipc.of[this._id]?.on("disconnect", () => this.onDisconnect())
				ipc.of[this._id]?.on("message", (data) => this.onMessage(data))
				ipc.of[this._id]?.on("error", (error) => this.onError(error))
			})

			// Set connection timeout for headless environments
			if (HEADLESS_CONFIG.verboseLogging) {
				this._connectionTimeout = setTimeout(() => {
					if (!this._isConnected && !this._shutdownInProgress) {
						this.log(
							`[client#setupConnection] Connection timeout after ${HEADLESS_CONFIG.connectionTimeout}ms`,
						)
						this.handleConnectionFailure()
					}
				}, HEADLESS_CONFIG.connectionTimeout)
			}
		} catch (error) {
			this.log(`[client#setupConnection] Error setting up connection: ${error}`)
			this.handleConnectionFailure()
		}
	}

	private setupShutdownHandlers() {
		const gracefulShutdown = async (signal: string) => {
			if (this._shutdownInProgress) {
				return
			}

			this._shutdownInProgress = true
			this.log(`[IpcClient] Received ${signal}, initiating graceful shutdown...`)

			try {
				await this.shutdown()
			} catch (error) {
				this.log(`[IpcClient] Error during shutdown: ${error}`)
			}
		}

		// Handle various termination signals
		process.once("SIGTERM", () => gracefulShutdown("SIGTERM"))
		process.once("SIGINT", () => gracefulShutdown("SIGINT"))
		process.once("SIGHUP", () => gracefulShutdown("SIGHUP"))
	}

	private handleConnectionFailure() {
		if (this._shutdownInProgress) {
			return
		}

		this._reconnectAttempts++

		if (this._reconnectAttempts >= HEADLESS_CONFIG.maxRetries) {
			this.log(
				`[client#handleConnectionFailure] Max reconnection attempts (${HEADLESS_CONFIG.maxRetries}) reached`,
			)
			this.emit(IpcMessageType.Disconnect)
			return
		}

		this.log(
			`[client#handleConnectionFailure] Attempting reconnection ${this._reconnectAttempts}/${HEADLESS_CONFIG.maxRetries}`,
		)

		// Clear existing connection
		if (ipc.of[this._id]) {
			ipc.disconnect(this._id)
		}

		// Wait before reconnecting
		setTimeout(() => {
			if (!this._shutdownInProgress) {
				this.setupConnection()
			}
		}, HEADLESS_CONFIG.retryDelay * this._reconnectAttempts)
	}

	private onError(error: unknown) {
		this.log(`[client#onError] IPC client error: ${error}`)

		// In headless environments, try to recover from errors
		if (HEADLESS_CONFIG.verboseLogging && !this._shutdownInProgress) {
			this.log("[client#onError] Attempting to recover from error in headless environment...")
			this.handleConnectionFailure()
		}
	}

	private onConnect() {
		if (this._isConnected || this._shutdownInProgress) {
			return
		}

		// Clear connection timeout
		if (this._connectionTimeout) {
			clearTimeout(this._connectionTimeout)
			this._connectionTimeout = undefined
		}

		this.log("[client#onConnect]")
		this._isConnected = true
		this._reconnectAttempts = 0 // Reset reconnection attempts on successful connection
		this.emit(IpcMessageType.Connect)
	}

	private onDisconnect() {
		if (!this._isConnected || this._shutdownInProgress) {
			return
		}

		this.log("[client#onDisconnect]")
		this._isConnected = false
		this._clientId = undefined

		// Clear connection timeout
		if (this._connectionTimeout) {
			clearTimeout(this._connectionTimeout)
			this._connectionTimeout = undefined
		}

		this.emit(IpcMessageType.Disconnect)

		// Attempt reconnection in headless environments
		if (HEADLESS_CONFIG.verboseLogging && !this._shutdownInProgress) {
			this.log("[client#onDisconnect] Attempting reconnection in headless environment...")
			this.handleConnectionFailure()
		}
	}

	private onMessage(data: unknown) {
		if (this._shutdownInProgress) {
			this.log("[client#onMessage] Ignoring message - shutdown in progress")
			return
		}

		try {
			if (typeof data !== "object") {
				this._log("[client#onMessage] invalid data", data)
				return
			}

			const result = ipcMessageSchema.safeParse(data)

			if (!result.success) {
				this.log("[client#onMessage] invalid payload", result.error, data)
				return
			}

			const payload = result.data

			if (payload.origin === IpcOrigin.Server) {
				switch (payload.type) {
					case IpcMessageType.Ack:
						this._clientId = payload.data.clientId
						this.emit(IpcMessageType.Ack, payload.data)
						break
					case IpcMessageType.TaskEvent:
						this.emit(IpcMessageType.TaskEvent, payload.data)
						break
				}
			}
		} catch (error) {
			this.log(`[client#onMessage] Error processing message: ${error}`)
			if (HEADLESS_CONFIG.verboseLogging) {
				this.log(`[client#onMessage] Message data: ${JSON.stringify(data)}`)
			}
		}
	}

	private log(...args: unknown[]) {
		// Add timestamp and process info in headless mode
		if (HEADLESS_CONFIG.verboseLogging) {
			const timestamp = new Date().toISOString()
			const processInfo = `[PID:${process.pid}]`
			this._log(timestamp, processInfo, ...args)
		} else {
			this._log(...args)
		}
	}

	public sendCommand(command: TaskCommand) {
		if (this._shutdownInProgress) {
			this.log("[client#sendCommand] Cannot send command - shutdown in progress")
			return
		}

		if (!this._clientId) {
			this.log("[client#sendCommand] Cannot send command - no client ID")
			return
		}

		const message: IpcMessage = {
			type: IpcMessageType.TaskCommand,
			origin: IpcOrigin.Client,
			clientId: this._clientId,
			data: command,
		}

		this.sendMessage(message)
	}

	public sendMessage(message: IpcMessage) {
		if (this._shutdownInProgress) {
			this.log("[client#sendMessage] Cannot send message - shutdown in progress")
			return
		}

		try {
			const connection = ipc.of[this._id]
			if (connection) {
				connection.emit("message", message)
			} else {
				this.log("[client#sendMessage] IPC connection not available")
			}
		} catch (error) {
			this.log(`[client#sendMessage] Error sending message: ${error}`)
		}
	}

	public disconnect() {
		try {
			this._isConnected = false
			this._clientId = undefined

			if (this._connectionTimeout) {
				clearTimeout(this._connectionTimeout)
				this._connectionTimeout = undefined
			}

			if (ipc.of[this._id]) {
				ipc.disconnect(this._id)
			}
		} catch (error) {
			this.log("[client#disconnect] error disconnecting", error)
		}
	}

	public async shutdown(): Promise<void> {
		this.log("[IpcClient] Starting graceful shutdown...")

		try {
			this._shutdownInProgress = true

			// Clear connection timeout
			if (this._connectionTimeout) {
				clearTimeout(this._connectionTimeout)
				this._connectionTimeout = undefined
			}

			// Disconnect from server
			this.disconnect()

			this.log("[IpcClient] Graceful shutdown completed")
		} catch (error) {
			this.log(`[IpcClient] Error during shutdown: ${error}`)
			throw error
		}
	}

	public get socketPath() {
		return this._socketPath
	}

	public get clientId() {
		return this._clientId
	}

	public get isConnected() {
		return this._isConnected
	}

	public get isReady() {
		return this._isConnected && this._clientId !== undefined
	}
}
