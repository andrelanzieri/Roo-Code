import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Browser, Page, launch, connect } from "puppeteer-core"
// @ts-ignore
import PCR from "puppeteer-chromium-resolver"
import { serializeError } from "serialize-error"

import { fileExistsAtPath } from "../../utils/fs"
import type { BrowserActionResult } from "../../shared/ExtensionMessage"
import { discoverChromeHostUrl, tryChromeHostUrl } from "./browserDiscovery"

/**
 * Interactive browser session for the browser_action tool.
 *
 * Features:
 * - Local Chromium via puppeteer-chromium-resolver
 * - Optional remote browser connection via DevTools when enabled in state
 * - Stable navigation with networkidle2, fallback to domcontentloaded
 * - Per-action console-log capture and screenshot (PNG data URL)
 * - Tracks current URL and last-known mouse position
 */
export class BrowserSession {
	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page

	private logsBuffer: string[] = []
	private consoleAttached = false

	private mouseX: number | null = null
	private mouseY: number | null = null

	private viewport = { width: 900, height: 600 }

	private isUsingRemoteBrowser = false

	private static readonly URL_FETCH_TIMEOUT = 30_000
	private static readonly URL_FETCH_FALLBACK_TIMEOUT = 20_000

	constructor(context: vscode.ExtensionContext) {
		this.context = context
	}

	private async ensureChromiumExists(): Promise<{ puppeteer: { launch: typeof launch }; executablePath: string }> {
		const globalStoragePath = this.context?.globalStorageUri?.fsPath
		if (!globalStoragePath) {
			throw new Error("Global storage uri is invalid")
		}
		const puppeteerDir = path.join(globalStoragePath, "puppeteer")
		const dirExists = await fileExistsAtPath(puppeteerDir)
		if (!dirExists) {
			await fs.mkdir(puppeteerDir, { recursive: true })
		}
		const stats = await PCR({
			downloadPath: puppeteerDir,
		})
		return stats
	}

	private attachConsoleListener(): void {
		if (this.consoleAttached || !this.page) return
		this.page.on("console", (msg) => {
			try {
				const text = (msg as any).text?.() ?? String(msg)
				this.logsBuffer.push(text)
				if (this.logsBuffer.length > 200) {
					this.logsBuffer.splice(0, this.logsBuffer.length - 200)
				}
			} catch {
				// ignore
			}
		})
		this.consoleAttached = true
	}

	private resetLogs(): void {
		this.logsBuffer = []
	}

	private flushLogs(): string {
		const joined = this.logsBuffer.join("\n")
		this.resetLogs()
		return joined
	}

	private ensurePage(): Page {
		if (!this.page) throw new Error("Browser not initialized")
		return this.page
	}

	private async captureResult(includeScreenshot: boolean = true): Promise<BrowserActionResult> {
		// brief stabilization
		await this.delay(150)

		let screenshot: string | undefined
		const page = this.ensurePage()

		if (includeScreenshot && (page as any).screenshot) {
			const b64 = (await (page as any).screenshot({ type: "png", encoding: "base64", fullPage: false })) as string
			screenshot = `data:image/png;base64,${b64}`
		}

		const logs = this.flushLogs()
		const currentUrl = (page as any).url ? (page as any).url() : undefined
		const currentMousePosition =
			this.mouseX != null && this.mouseY != null ? `${this.mouseX},${this.mouseY}` : undefined

		return { screenshot, logs, currentUrl, currentMousePosition }
	}

	private async navigateWithFallback(url: string): Promise<void> {
		const page = this.ensurePage()
		try {
			await (page as any).goto?.(url, {
				timeout: BrowserSession.URL_FETCH_TIMEOUT,
				waitUntil: ["domcontentloaded", "networkidle2"],
			} as any)
		} catch (error) {
			const serialized = serializeError(error)
			const message = serialized.message || String(error)
			const name = serialized.name

			const shouldRetry =
				message.includes("timeout") ||
				message.includes("net::") ||
				message.includes("NetworkError") ||
				message.includes("ERR_") ||
				name === "TimeoutError"

			if (shouldRetry) {
				await (page as any).goto?.(url, {
					timeout: BrowserSession.URL_FETCH_FALLBACK_TIMEOUT,
					waitUntil: ["domcontentloaded"],
				} as any)
			} else {
				throw error
			}
		}
	}

	private async connectRemote(browserUrl: string): Promise<void> {
		this.browser = await connect({ browserURL: browserUrl } as any)
		this.isUsingRemoteBrowser = true
		// Attempt to open a page for action flow if needed
		if ((this.browser as any).newPage) {
			this.page = await (this.browser as any).newPage()
		}
		this.attachConsoleListener()
		this.resetLogs()
	}

	async launchBrowser(): Promise<void> {
		if (this.browser) {
			return
		}

		// Try remote first if enabled
		try {
			const remoteEnabled = !!this.context.globalState.get<boolean>("remoteBrowserEnabled")
			if (remoteEnabled) {
				const configuredHost = this.context.globalState.get<string>("remoteBrowserHost")
				if (configuredHost) {
					if (await tryChromeHostUrl(configuredHost)) {
						await this.connectRemote(configuredHost)
						return
					}
				}
				const discovered = await discoverChromeHostUrl()
				if (discovered && (await tryChromeHostUrl(discovered))) {
					await this.connectRemote(discovered)
					return
				}
			}
		} catch {
			// If remote resolution throws for any reason, continue to local launch
		}

		// Local launch fallback
		const stats = await this.ensureChromiumExists()
		const args: string[] = [
			"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
			"--disable-dev-shm-usage",
			"--disable-accelerated-2d-canvas",
			"--no-first-run",
			"--disable-gpu",
			"--disable-features=VizDisplayCompositor",
		]
		if (process.platform === "linux") {
			args.push("--no-sandbox")
		}

		this.browser = await stats.puppeteer.launch({
			args,
			executablePath: stats.executablePath,
		})
		// Create a page when possible
		if ((this.browser as any).newPage) {
			this.page = await (this.browser as any).newPage()
		}

		// Page defaults (guard functions to satisfy unit test mocks)
		if (this.page && (this.page as any).setViewport) {
			await (this.page as any).setViewport({ width: this.viewport.width, height: this.viewport.height })
		}
		if (this.page && (this.page as any).setExtraHTTPHeaders) {
			await (this.page as any).setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" })
		}

		this.isUsingRemoteBrowser = false
		this.attachConsoleListener()
		this.resetLogs()
	}

	async navigateToUrl(url: string): Promise<BrowserActionResult> {
		await this.navigateWithFallback(url)
		return this.captureResult(true)
	}

	async click(coordinate: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { x, y } = this.parseCoordinate(coordinate)
		if ((page as any).mouse?.move && (page as any).mouse?.click) {
			await (page as any).mouse.move(x, y)
			await (page as any).mouse.click(x, y, { button: "left", clickCount: 1 })
		}
		this.mouseX = x
		this.mouseY = y
		return this.captureResult(true)
	}

	async hover(coordinate: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { x, y } = this.parseCoordinate(coordinate)
		if ((page as any).mouse?.move) {
			await (page as any).mouse.move(x, y)
		}
		this.mouseX = x
		this.mouseY = y
		return this.captureResult(true)
	}

	async type(text: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		if ((page as any).keyboard?.type) {
			await (page as any).keyboard.type(text, { delay: 10 })
		}
		return this.captureResult(true)
	}

	async scrollDown(): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await (page as any).evaluate?.(() => {
			// Scroll by one viewport height
			window.scrollBy(0, window.innerHeight)
		})
		return this.captureResult(true)
	}

	async scrollUp(): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await (page as any).evaluate?.(() => {
			window.scrollBy(0, -window.innerHeight)
		})
		return this.captureResult(true)
	}

	async resize(size: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { w, h } = this.parseSize(size)
		this.viewport = { width: w, height: h }
		if ((page as any).setViewport) {
			await (page as any).setViewport({ width: w, height: h })
		}
		return this.captureResult(true)
	}

	async closeBrowser(): Promise<BrowserActionResult> {
		try {
			if (this.browser) {
				if (this.isUsingRemoteBrowser && (this.browser as any).disconnect) {
					await (this.browser as any).disconnect()
				} else {
					await this.browser.close()
				}
			}
		} finally {
			this.browser = undefined
			this.page = undefined
			this.consoleAttached = false
			this.resetLogs()
			this.mouseX = null
			this.mouseY = null
			this.isUsingRemoteBrowser = false
		}
		return {}
	}

	private parseCoordinate(coordinate: string): { x: number; y: number } {
		const parts = (coordinate || "").split(",").map((s) => Number(s.trim()))
		if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) {
			throw new Error(`Invalid coordinate: '${coordinate}'. Expected format: "x,y"`)
		}
		const [x, y] = parts
		if (x < 0 || y < 0) {
			throw new Error(`Invalid coordinate: '${coordinate}'. Coordinates must be non-negative.`)
		}
		return { x, y }
	}

	private parseSize(size: string): { w: number; h: number } {
		const parts = (size || "").split(",").map((s) => Number(s.trim()))
		if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) {
			throw new Error(`Invalid size: '${size}'. Expected format: "width,height"`)
		}
		const [w, h] = parts
		if (w <= 0 || h <= 0) {
			throw new Error(`Invalid size: '${size}'. Width and height must be positive integers.`)
		}
		return { w, h }
	}

	private async delay(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms))
	}
}
