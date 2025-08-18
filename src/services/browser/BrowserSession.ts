import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { Browser, Page, launch } from "puppeteer-core"
// @ts-ignore
import PCR from "puppeteer-chromium-resolver"
import { serializeError } from "serialize-error"

import { fileExistsAtPath } from "../../utils/fs"
import type { BrowserActionResult } from "../../shared/ExtensionMessage"

/**
 * Interactive browser session for the browser_action tool.
 * - Local Chromium via puppeteer-chromium-resolver (atomic download to global storage).
 * - Robust navigation (networkidle2 with timeout fallback to domcontentloaded).
 * - Captures console logs and returns them with every action.
 * - Returns a screenshot (PNG, base64 data URL) on every action except "close".
 * - Tracks the current mouse position for debugging/telemetry.
 *
 * Note: Viewport defaults to 900x600 to match the prompt description. The model may change it using the "resize" action.
 */
export class BrowserSession {
	private context: vscode.ExtensionContext
	private browser?: Browser
	private page?: Page

	// Logs captured from console events for the current action window
	private logsBuffer: string[] = []
	private consoleAttached = false

	// Track last known mouse coordinates for debugging
	private mouseX: number | null = null
	private mouseY: number | null = null

	// Default viewport; will be applied on launch and can be changed via resize()
	private viewport = { width: 900, height: 600 }

	// Timeout constants (aligned with UrlContentFetcher semantics)
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
				// Append newest at end; keep a reasonable limit to avoid unbounded growth
				const text = msg.text?.() ?? String(msg)
				this.logsBuffer.push(text)
				if (this.logsBuffer.length > 200) {
					this.logsBuffer.splice(0, this.logsBuffer.length - 200)
				}
			} catch {
				// Ignore console parsing errors
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
		if (!this.page) {
			throw new Error("Browser not initialized")
		}
		return this.page
	}

	private async captureResult(includeScreenshot: boolean = true): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		// Small stabilization delay for SPA updates after actions
		await this.delay(150)

		let screenshot: string | undefined
		if (includeScreenshot) {
			const b64 = (await page.screenshot({ type: "png", encoding: "base64", fullPage: false })) as string
			screenshot = `data:image/png;base64,${b64}`
		}

		const logs = this.flushLogs()
		const currentUrl = page.url()
		const currentMousePosition =
			this.mouseX != null && this.mouseY != null ? `${this.mouseX},${this.mouseY}` : undefined

		return { screenshot, logs, currentUrl, currentMousePosition }
	}

	private async navigateWithFallback(url: string): Promise<void> {
		const page = this.ensurePage()
		try {
			await page.goto(url, {
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
				await page.goto(url, {
					timeout: BrowserSession.URL_FETCH_FALLBACK_TIMEOUT,
					waitUntil: ["domcontentloaded"],
				} as any)
			} else {
				throw error
			}
		}
	}

	async launchBrowser(): Promise<void> {
		if (this.browser) {
			return
		}
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
		this.page = await this.browser.newPage()

		// Page defaults
		await this.page.setViewport({ width: this.viewport.width, height: this.viewport.height })
		await this.page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" })

		// Attach log capture
		this.attachConsoleListener()
		// Reset logs on new launch
		this.resetLogs()
	}

	async navigateToUrl(url: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await this.navigateWithFallback(url)
		return this.captureResult(true)
	}

	async click(coordinate: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { x, y } = this.parseCoordinate(coordinate)
		await page.mouse.move(x, y)
		await page.mouse.click(x, y, { button: "left", clickCount: 1 })
		this.mouseX = x
		this.mouseY = y
		return this.captureResult(true)
	}

	async hover(coordinate: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { x, y } = this.parseCoordinate(coordinate)
		await page.mouse.move(x, y)
		this.mouseX = x
		this.mouseY = y
		return this.captureResult(true)
	}

	async type(text: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await page.keyboard.type(text, { delay: 10 })
		return this.captureResult(true)
	}

	async scrollDown(): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await page.evaluate(() => {
			// Scroll by one viewport height
			window.scrollBy(0, window.innerHeight)
		})
		return this.captureResult(true)
	}

	async scrollUp(): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		await page.evaluate(() => {
			window.scrollBy(0, -window.innerHeight)
		})
		return this.captureResult(true)
	}

	async resize(size: string): Promise<BrowserActionResult> {
		const page = this.ensurePage()
		const { w, h } = this.parseSize(size)
		this.viewport = { width: w, height: h }
		await page.setViewport({ width: w, height: h })
		return this.captureResult(true)
	}

	async closeBrowser(): Promise<BrowserActionResult> {
		try {
			if (this.browser) {
				await this.browser.close()
			}
		} finally {
			this.browser = undefined
			this.page = undefined
			this.consoleAttached = false
			this.resetLogs()
			this.mouseX = null
			this.mouseY = null
		}
		// No screenshot on close
		return {}
	}

	// Utils

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
