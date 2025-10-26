import * as http from "http"
import * as fs from "fs"
import * as path from "path"
import * as url from "url"
import { AddressInfo } from "net"

export class CaptureServer {
	private server: http.Server | null = null
	private port: number = 0

	constructor() {}

	private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const parsedUrl = url.parse(req.url || "", true)
		const pathname = parsedUrl.pathname

		if (pathname === "/capture") {
			// Serve the capture page
			const htmlPath = path.join(__dirname, "capture-page.html")
			fs.readFile(htmlPath, "utf8", (err, data) => {
				if (err) {
					res.writeHead(500, { "Content-Type": "text/plain" })
					res.end("Error loading capture page")
					return
				}
				res.writeHead(200, { "Content-Type": "text/html" })
				res.end(data)
			})
		} else if (pathname === "/health") {
			// Health check endpoint
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify({ status: "ok" }))
		} else {
			// 404 for other paths
			res.writeHead(404, { "Content-Type": "text/plain" })
			res.end("Not Found")
		}
	}

	public async start(): Promise<number> {
		return new Promise((resolve, reject) => {
			this.server = http.createServer((req, res) => {
				this.handleRequest(req, res)
			})

			// Try to find an available port
			this.server.listen(0, "127.0.0.1", () => {
				if (this.server) {
					const address = this.server.address() as AddressInfo
					this.port = address.port
					console.log(`STT Capture server started on port ${this.port}`)
					resolve(this.port)
				} else {
					reject(new Error("Failed to start capture server"))
				}
			})

			this.server.on("error", (error) => {
				reject(error)
			})
		})
	}

	public stop(): void {
		if (this.server) {
			this.server.close()
			this.server = null
			this.port = 0
		}
	}

	public getPort(): number {
		return this.port
	}
}

// Singleton instance
let captureServerInstance: CaptureServer | null = null

export function getCaptureServer(): CaptureServer {
	if (!captureServerInstance) {
		captureServerInstance = new CaptureServer()
	}
	return captureServerInstance
}

export function stopCaptureServer(): void {
	if (captureServerInstance) {
		captureServerInstance.stop()
		captureServerInstance = null
	}
}
