import EventEmitter from "node:events"
import { Socket } from "node:net"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"

import ipc from "node-ipc"

import {
	type IpcServerEvents,
	type RooCodeIpcServer,
	IpcOrigin,
	IpcMessageType,
	type IpcMessage,
	ipcMessageSchema,
} from "@roo-code/types"

// Configuration for headless environments
const HEADLESS_CONFIG = {
	// Increase retry attempts for headless environments
	maxRetries: 10,
	// Increase retry delay for slower environments
	retryDelay: 1000,
	// Socket timeout for headless environments (ms)
	socketTimeout: 30000,
	// Enable verbose logging in headless mode
	verboseLogging: process.env.DISPLAY === ":99" || process.env.XVFB_DISPLAY !== undefined,
}

export class IpcServer extends EventEmitter<IpcServerEvents> implements RooCodeIpcServer {
	private readonly _socketPath: string
	private readonly _log: (...args: unknown[]) => void
	private readonly _clients: Map<string, Socket>
	private _shutdownInProgress = false
	private _connectionTimeouts: Map<string, NodeJS.Timeout> = new Map()

	private _isListening = false

	constructor(socketPath: string, log = console.log) {
		super()

		this._socketPath = socketPath
		this._log = log
		this._clients = new Map()

		// Setup graceful shutdown handlers
		this.setupShutdownHandlers()
	}

	private setupShutdownHandlers() {
		const gracefulShutdown = async (signal: string) => {
			if (this._shutdownInProgress) {
				return
			}

			this._shutdownInProgress = true
			this.log(`[IpcServer] Received ${signal}, initiating graceful shutdown...`)

			try {
				await this.shutdown()
			} catch (error) {
				this.log(`[IpcServer] Error during shutdown: ${error}`)
			}
		}

		// Handle various termination signals
		process.once("SIGTERM", () => gracefulShutdown("SIGTERM"))
		process.once("SIGINT", () => gracefulShutdown("SIGINT"))
		process.once("SIGHUP", () => gracefulShutdown("SIGHUP"))

		// Handle uncaught exceptions in headless environments
		if (HEADLESS_CONFIG.verboseLogging) {
			process.on("uncaughtException", (error) => {
				this.log(`[IpcServer] Uncaught exception in headless environment: ${error}`)
				this.log(`[IpcServer] Stack trace: ${error.stack}`)
			})

			process.on("unhandledRejection", (reason, promise) => {
				this.log(`[IpcServer] Unhandled rejection at: ${promise}, reason: ${reason}`)
			})
		}
	}

	public listen() {
		if (this._shutdownInProgress) {
			this.log("[IpcServer] Cannot start listening - shutdown in progress")
			return
		}

		this._isListening = true

		// Configure IPC for headless environments
		ipc.config.silent = true
		ipc.config.retry = HEADLESS_CONFIG.retryDelay
		ipc.config.maxRetries = HEADLESS_CONFIG.maxRetries

		// Ensure socket directory exists (important for Docker containers)
		const socketDir = path.dirname(this.socketPath)
		if (!fs.existsSync(socketDir)) {
			try {
				fs.mkdirSync(socketDir, { recursive: true })
				this.log(`[IpcServer] Created socket directory: ${socketDir}`)
			} catch (error) {
				this.log(`[IpcServer] Failed to create socket directory: ${error}`)
			}
		}

		// Clean up any existing socket file
		if (fs.existsSync(this.socketPath)) {
			try {
				fs.unlinkSync(this.socketPath)
				this.log(`[IpcServer] Removed existing socket file: ${this.socketPath}`)
			} catch (error) {
				this.log(`[IpcServer] Failed to remove existing socket: ${error}`)
			}
		}

		try {
			ipc.serve(this.socketPath, () => {
				ipc.server.on("connect", (socket) => this.onConnect(socket))
				ipc.server.on("socket.disconnected", (socket) => this.onDisconnect(socket))
				ipc.server.on("message", (data) => this.onMessage(data))
				ipc.server.on("error", (error) => this.onError(error))
			})

			ipc.server.start()

			if (HEADLESS_CONFIG.verboseLogging) {
				this.log(`[IpcServer] Started listening on ${this.socketPath} in headless mode`)
			}
		} catch (error) {
			this.log(`[IpcServer] Failed to start IPC server: ${error}`)
			throw error
		}
	}

	private onError(error: unknown) {
		this.log(`[IpcServer] IPC server error: ${error}`)

		// In headless environments, try to recover from errors
		if (HEADLESS_CONFIG.verboseLogging && !this._shutdownInProgress) {
			this.log("[IpcServer] Attempting to recover from error in headless environment...")

			// Clear all client connections
			this._clients.clear()
			this._connectionTimeouts.forEach((timeout) => clearTimeout(timeout))
			this._connectionTimeouts.clear()

			// Emit disconnect events for cleanup
			this.emit(IpcMessageType.Disconnect, "error-recovery")
		}
	}

	private onConnect(socket: Socket) {
		if (this._shutdownInProgress) {
			this.log("[server#onConnect] Rejecting connection - shutdown in progress")
			socket.destroy()
			return
		}

		const clientId = crypto.randomBytes(6).toString("hex")

		try {
			// Configure socket for headless environments
			socket.setKeepAlive(true, 5000) // Keep-alive every 5 seconds
			socket.setTimeout(HEADLESS_CONFIG.socketTimeout)

			// Handle socket timeout
			socket.on("timeout", () => {
				this.log(`[server#onConnect] Socket timeout for client ${clientId}`)
				this.handleClientDisconnect(clientId, socket)
			})

			// Handle socket errors
			socket.on("error", (error) => {
				this.log(`[server#onConnect] Socket error for client ${clientId}: ${error}`)
				this.handleClientDisconnect(clientId, socket)
			})

			this._clients.set(clientId, socket)

			// Set up connection timeout for headless environments
			if (HEADLESS_CONFIG.verboseLogging) {
				const timeout = setTimeout(() => {
					if (this._clients.has(clientId)) {
						this.log(`[server#onConnect] Client ${clientId} connection timeout in headless mode`)
						this.handleClientDisconnect(clientId, socket)
					}
				}, HEADLESS_CONFIG.socketTimeout)

				this._connectionTimeouts.set(clientId, timeout)
			}

			this.log(`[server#onConnect] clientId = ${clientId}, # clients = ${this._clients.size}`)

			this.send(socket, {
				type: IpcMessageType.Ack,
				origin: IpcOrigin.Server,
				data: { clientId, pid: process.pid, ppid: process.ppid },
			})

			this.emit(IpcMessageType.Connect, clientId)
		} catch (error) {
			this.log(`[server#onConnect] Error setting up client ${clientId}: ${error}`)
			this.handleClientDisconnect(clientId, socket)
		}
	}

	private handleClientDisconnect(clientId: string, socket: Socket) {
		try {
			// Clear connection timeout if exists
			const timeout = this._connectionTimeouts.get(clientId)
			if (timeout) {
				clearTimeout(timeout)
				this._connectionTimeouts.delete(clientId)
			}

			// Remove client from map
			if (this._clients.has(clientId)) {
				this._clients.delete(clientId)
				this.log(
					`[server#handleClientDisconnect] Removed client ${clientId}, # clients = ${this._clients.size}`,
				)
			}

			// Safely destroy socket
			if (socket && !socket.destroyed) {
				socket.destroy()
			}

			// Emit disconnect event
			this.emit(IpcMessageType.Disconnect, clientId)
		} catch (error) {
			this.log(`[server#handleClientDisconnect] Error disconnecting client ${clientId}: ${error}`)
		}
	}

	private onDisconnect(destroyedSocket: Socket) {
		let disconnectedClientId: string | undefined

		for (const [clientId, socket] of this._clients.entries()) {
			if (socket === destroyedSocket) {
				disconnectedClientId = clientId
				break
			}
		}

		if (disconnectedClientId) {
			this.handleClientDisconnect(disconnectedClientId, destroyedSocket)
		} else {
			this.log(`[server#socket.disconnected] Unknown socket disconnected`)
		}
	}

	private onMessage(data: unknown) {
		if (this._shutdownInProgress) {
			this.log("[server#onMessage] Ignoring message - shutdown in progress")
			return
		}

		try {
			if (typeof data !== "object") {
				this.log("[server#onMessage] invalid data", data)
				return
			}

			const result = ipcMessageSchema.safeParse(data)

			if (!result.success) {
				this.log("[server#onMessage] invalid payload", result.error.format(), data)
				return
			}

			const payload = result.data

			// Clear connection timeout on successful message from client
			if (payload.origin === IpcOrigin.Client && "clientId" in payload) {
				const clientId = payload.clientId
				if (clientId && this._connectionTimeouts.has(clientId)) {
					clearTimeout(this._connectionTimeouts.get(clientId)!)
					this._connectionTimeouts.delete(clientId)
				}

				switch (payload.type) {
					case IpcMessageType.TaskCommand:
						this.emit(IpcMessageType.TaskCommand, payload.clientId, payload.data)
						break
					default:
						this.log(`[server#onMessage] unhandled payload: ${JSON.stringify(payload)}`)
						break
				}
			}
		} catch (error) {
			this.log(`[server#onMessage] Error processing message: ${error}`)
			if (HEADLESS_CONFIG.verboseLogging) {
				this.log(`[server#onMessage] Message data: ${JSON.stringify(data)}`)
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

	public broadcast(message: IpcMessage) {
		if (this._shutdownInProgress) {
			this.log("[server#broadcast] Cannot broadcast - shutdown in progress")
			return
		}

		try {
			// this.log("[server#broadcast] message =", message)
			ipc.server.broadcast("message", message)
		} catch (error) {
			this.log(`[server#broadcast] Error broadcasting message: ${error}`)
		}
	}

	public send(client: string | Socket, message: IpcMessage) {
		if (this._shutdownInProgress) {
			this.log("[server#send] Cannot send - shutdown in progress")
			return
		}

		try {
			// this.log("[server#send] message =", message)

			if (typeof client === "string") {
				const socket = this._clients.get(client)

				if (socket && !socket.destroyed) {
					ipc.server.emit(socket, "message", message)
				} else {
					this.log(`[server#send] Client ${client} not found or socket destroyed`)
				}
			} else {
				if (!client.destroyed) {
					ipc.server.emit(client, "message", message)
				} else {
					this.log("[server#send] Socket is destroyed")
				}
			}
		} catch (error) {
			this.log(`[server#send] Error sending message: ${error}`)
		}
	}

	public async shutdown(): Promise<void> {
		this.log("[IpcServer] Starting graceful shutdown...")

		try {
			// Clear all timeouts
			this._connectionTimeouts.forEach((timeout) => clearTimeout(timeout))
			this._connectionTimeouts.clear()

			// Disconnect all clients gracefully
			for (const [clientId, socket] of this._clients.entries()) {
				try {
					this.log(`[IpcServer] Disconnecting client ${clientId}`)
					this.handleClientDisconnect(clientId, socket)
				} catch (error) {
					this.log(`[IpcServer] Error disconnecting client ${clientId}: ${error}`)
				}
			}

			// Stop the IPC server
			if (ipc.server) {
				ipc.server.stop()
			}

			// Clean up socket file
			if (fs.existsSync(this.socketPath)) {
				try {
					fs.unlinkSync(this.socketPath)
					this.log(`[IpcServer] Removed socket file: ${this.socketPath}`)
				} catch (error) {
					this.log(`[IpcServer] Failed to remove socket file: ${error}`)
				}
			}

			this._isListening = false
			this.log("[IpcServer] Graceful shutdown completed")
		} catch (error) {
			this.log(`[IpcServer] Error during shutdown: ${error}`)
			throw error
		}
	}

	public get socketPath() {
		return this._socketPath
	}

	public get isListening() {
		return this._isListening
	}
}
