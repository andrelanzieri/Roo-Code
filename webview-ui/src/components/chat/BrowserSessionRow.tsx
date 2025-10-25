import React, { memo, useEffect, useMemo, useRef, useState } from "react"
import deepEqual from "fast-deep-equal"
import { useTranslation } from "react-i18next"
import type { ClineMessage } from "@roo-code/types"

import { BrowserAction, BrowserActionResult, ClineSayBrowserAction } from "@roo/ExtensionMessage"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"

import CodeBlock from "../common/CodeBlock"
import { ProgressIndicator } from "./ProgressIndicator"
import { Button, StandardTooltip } from "@src/components/ui"
import {
	Globe,
	Pointer,
	SquareTerminal,
	MousePointer as MousePointerIcon,
	Keyboard,
	ArrowDown,
	ArrowUp,
	Play,
	Check,
	Maximize2,
	OctagonX,
} from "lucide-react"

const prettyKey = (k?: string): string => {
	if (!k) return ""
	return k
		.split("+")
		.map((part) => {
			const p = part.trim()
			const lower = p.toLowerCase()
			const map: Record<string, string> = {
				enter: "Enter",
				tab: "Tab",
				escape: "Esc",
				esc: "Esc",
				backspace: "Backspace",
				space: "Space",
				shift: "Shift",
				control: "Ctrl",
				ctrl: "Ctrl",
				alt: "Alt",
				meta: "Meta",
				command: "Cmd",
				cmd: "Cmd",
				arrowup: "Arrow Up",
				arrowdown: "Arrow Down",
				arrowleft: "Arrow Left",
				arrowright: "Arrow Right",
				pageup: "Page Up",
				pagedown: "Page Down",
				home: "Home",
				end: "End",
			}
			if (map[lower]) return map[lower]
			const keyMatch = /^Key([A-Z])$/.exec(p)
			if (keyMatch) return keyMatch[1].toUpperCase()
			const digitMatch = /^Digit([0-9])$/.exec(p)
			if (digitMatch) return digitMatch[1]
			const spaced = p.replace(/([a-z])([A-Z])/g, "$1 $2")
			return spaced.charAt(0).toUpperCase() + spaced.slice(1)
		})
		.join(" + ")
}

const getBrowserActionText = (action: BrowserAction, coordinate?: string, text?: string, size?: string) => {
	switch (action) {
		case "launch":
			return `Launched browser`
		case "click":
			return `Clicked at: ${coordinate}`
		case "type":
			return `Typed: ${text}`
		case "press":
			return `Pressed key: ${prettyKey(text)}`
		case "scroll_down":
			return "Scrolled down"
		case "scroll_up":
			return "Scrolled up"
		case "hover":
			return `Hovered at: ${coordinate}`
		case "resize":
			return `Resized to: ${size?.split(/[x,]/).join(" x ")}`
		case "close":
			return "Closed browser"
		default:
			return action
	}
}

const getActionIcon = (action: BrowserAction) => {
	switch (action) {
		case "click":
			return <MousePointerIcon className="w-4 h-4 opacity-80" />
		case "type":
		case "press":
			return <Keyboard className="w-4 h-4 opacity-80" />
		case "scroll_down":
			return <ArrowDown className="w-4 h-4 opacity-80" />
		case "scroll_up":
			return <ArrowUp className="w-4 h-4 opacity-80" />
		case "launch":
			return <Play className="w-4 h-4 opacity-80" />
		case "close":
			return <Check className="w-4 h-4 opacity-80" />
		case "resize":
			return <Maximize2 className="w-4 h-4 opacity-80" />
		case "hover":
		default:
			return <Pointer className="w-4 h-4 opacity-80" />
	}
}

interface BrowserSessionRowProps {
	messages: ClineMessage[]
	isExpanded: (messageTs: number) => boolean
	onToggleExpand: (messageTs: number) => void
	lastModifiedMessage?: ClineMessage
	isLast: boolean
	onHeightChange: (isTaller: boolean) => void
	isStreaming: boolean
}

const BrowserSessionRow = memo((props: BrowserSessionRowProps) => {
	const { messages, isLast, onHeightChange, lastModifiedMessage } = props
	const { t } = useTranslation()
	const prevHeightRef = useRef(0)
	const [consoleLogsExpanded, setConsoleLogsExpanded] = useState(false)
	const [nextActionsExpanded, setNextActionsExpanded] = useState(false)

	const { browserViewportSize = "900x600", isBrowserSessionActive = false } = useExtensionState()
	const [viewportWidth, viewportHeight] = browserViewportSize.split("x").map(Number)
	const defaultMousePosition = `${Math.round(viewportWidth / 2)},${Math.round(viewportHeight / 2)}`

	const isLastApiReqInterrupted = useMemo(() => {
		// Check if last api_req_started is cancelled
		const lastApiReqStarted = [...messages].reverse().find((m) => m.say === "api_req_started")
		if (lastApiReqStarted?.text) {
			const info = JSON.parse(lastApiReqStarted.text) as { cancelReason: string | null }
			if (info && info.cancelReason !== null) {
				return true
			}
		}
		const lastApiReqFailed = isLast && lastModifiedMessage?.ask === "api_req_failed"
		if (lastApiReqFailed) {
			return true
		}
		return false
	}, [messages, lastModifiedMessage, isLast])

	const isBrowsing = useMemo(() => {
		return isLast && messages.some((m) => m.say === "browser_action_result") && !isLastApiReqInterrupted // after user approves, browser_action_result with "" is sent to indicate that the session has started
	}, [isLast, messages, isLastApiReqInterrupted])

	// Organize messages into pages based on ALL browser actions (including those without screenshots)
	const pages = useMemo(() => {
		const result: {
			url?: string
			screenshot?: string
			mousePosition?: string
			consoleLogs?: string
			action?: ClineSayBrowserAction
			size?: string
			viewportWidth?: number
			viewportHeight?: number
		}[] = []

		// Build pages from browser_action messages and pair with results
		messages.forEach((message) => {
			if (message.say === "browser_action") {
				try {
					const action = JSON.parse(message.text || "{}") as ClineSayBrowserAction
					// Find the corresponding result message
					const resultMessage = messages.find(
						(m) => m.say === "browser_action_result" && m.ts > message.ts && m.text !== "",
					)

					if (resultMessage) {
						const resultData = JSON.parse(resultMessage.text || "{}") as BrowserActionResult
						result.push({
							url: resultData.currentUrl,
							screenshot: resultData.screenshot,
							mousePosition: resultData.currentMousePosition,
							consoleLogs: resultData.logs,
							action,
							size: action.size,
							viewportWidth: resultData.viewportWidth,
							viewportHeight: resultData.viewportHeight,
						})
					} else {
						// For actions without results (like close), add a page without screenshot
						result.push({ action, size: action.size })
					}
				} catch {
					// ignore parse errors
				}
			}
		})

		// Add placeholder page if no actions yet
		if (result.length === 0) {
			result.push({})
		}

		return result
	}, [messages])

	// Auto-advance to latest page
	const [currentPageIndex, setCurrentPageIndex] = useState(0)
	useEffect(() => {
		setCurrentPageIndex(pages.length - 1)
	}, [pages.length])

	// Get initial URL from launch message
	const initialUrl = useMemo(() => {
		const launchMessage = messages.find((m) => m.ask === "browser_action_launch")
		return launchMessage?.text || ""
	}, [messages])

	const currentPage = pages[currentPageIndex]

	// Use actual viewport dimensions from result if available, otherwise fall back to settings

	// Find the last available screenshot and its associated data to use as placeholders
	const lastPageWithScreenshot = useMemo(() => {
		for (let i = pages.length - 1; i >= 0; i--) {
			if (pages[i].screenshot) {
				return pages[i]
			}
		}
		return undefined
	}, [pages])

	const lastPageWithMousePosition = useMemo(() => {
		for (let i = pages.length - 1; i >= 0; i--) {
			if (pages[i].mousePosition) {
				return pages[i]
			}
		}
		return undefined
	}, [pages])

	// Display state from current page, with smart fallbacks
	const displayState = {
		url: currentPage?.url || initialUrl,
		mousePosition: currentPage?.mousePosition || lastPageWithMousePosition?.mousePosition || defaultMousePosition,
		consoleLogs: currentPage?.consoleLogs,
		screenshot: currentPage?.screenshot || lastPageWithScreenshot?.screenshot,
	}

	// Use a fixed standard aspect ratio and dimensions for the drawer to prevent flickering
	// Even if viewport changes, the drawer maintains consistent size
	const fixedDrawerWidth = 900
	const fixedDrawerHeight = 600
	const drawerAspectRatio = (fixedDrawerHeight / fixedDrawerWidth) * 100

	const mousePosition = displayState.mousePosition || defaultMousePosition

	// For cursor positioning, use the viewport dimensions from the same page as the data we're displaying
	// This ensures cursor position matches the screenshot/mouse position being shown
	let cursorViewportWidth: number
	let cursorViewportHeight: number

	if (currentPage?.screenshot) {
		// Current page has screenshot - use its dimensions
		cursorViewportWidth = currentPage.viewportWidth ?? viewportWidth
		cursorViewportHeight = currentPage.viewportHeight ?? viewportHeight
	} else if (lastPageWithScreenshot) {
		// Using placeholder screenshot - use dimensions from that page
		cursorViewportWidth = lastPageWithScreenshot.viewportWidth ?? viewportWidth
		cursorViewportHeight = lastPageWithScreenshot.viewportHeight ?? viewportHeight
	} else {
		// No screenshot available - use default settings
		cursorViewportWidth = viewportWidth
		cursorViewportHeight = viewportHeight
	}

	// Get browser action for current page (now stored in pages array)
	const currentPageAction = useMemo(() => {
		return pages[currentPageIndex]?.action
	}, [pages, currentPageIndex])

	// Latest non-close browser_action for header summary (fallback)

	// Determine if the overall browser session is still active (spins until 'close')
	const lastBrowserActionOverall = useMemo(() => {
		const all = messages.filter((m) => m.say === "browser_action")
		return all.at(-1)
	}, [messages])

	// Use actual Playwright session state from extension (not message parsing)
	const isBrowserSessionOpen = isBrowserSessionActive

	// Check if currently performing a browser action (for spinner)
	const isSessionActive = useMemo(() => {
		// Only show active spinner if a session has started
		const started = messages.some((m) => m.say === "browser_action_result")
		if (!started) return false
		// If the last API request got interrupted/cancelled, treat session as inactive
		if (isLastApiReqInterrupted) return false
		if (!lastBrowserActionOverall) return true
		try {
			const act = JSON.parse(lastBrowserActionOverall.text || "{}") as ClineSayBrowserAction
			return act.action !== "close"
		} catch {
			return true
		}
	}, [messages, lastBrowserActionOverall, isLastApiReqInterrupted])

	// Browser session drawer never auto-expands - user must manually toggle it

	// Calculate total API cost for the browser session
	const totalApiCost = useMemo(() => {
		let total = 0
		messages.forEach((message) => {
			if (message.say === "api_req_started" && message.text) {
				try {
					const data = JSON.parse(message.text)
					if (data.cost && typeof data.cost === "number") {
						total += data.cost
					}
				} catch {
					// Ignore parsing errors
				}
			}
		})
		return total
	}, [messages])

	// Local size tracking without react-use to avoid timers after unmount in tests
	const containerRef = useRef<HTMLDivElement>(null)
	const [rowHeight, setRowHeight] = useState(0)
	useEffect(() => {
		const el = containerRef.current
		if (!el) return
		let mounted = true
		const setH = (h: number) => {
			if (mounted) setRowHeight(h)
		}
		const ro =
			typeof window !== "undefined" && "ResizeObserver" in window
				? new ResizeObserver((entries) => {
						const entry = entries[0]
						setH(entry?.contentRect?.height ?? el.getBoundingClientRect().height)
					})
				: null
		// initial
		setH(el.getBoundingClientRect().height)
		if (ro) ro.observe(el)
		return () => {
			mounted = false
			if (ro) ro.disconnect()
		}
	}, [])

	const browserSessionRow = (
		<div
			ref={containerRef}
			className="border border-t-0 rounded-b-xs"
			style={{
				margin: "0 15px -10px 15px",
				padding: "6px 10px",
				background: "var(--vscode-editor-background,transparent)",
				borderColor: "var(--vscode-panel-border)",
				position: "relative",
				zIndex: 10,
			}}>
			{/* Main header - clickable to expand/collapse, mimics TodoList style */}
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					marginBottom: 0,
					userSelect: "none",
				}}>
				{/* Globe icon - green when browser session is open */}
				<Globe
					className="w-4 h-4 shrink-0"
					style={{
						opacity: 0.7,
						color: isBrowserSessionOpen ? "#4ade80" : undefined, // green-400 when session is open
						cursor: "pointer",
					}}
					aria-label="Browser interaction"
					onClick={() => setNextActionsExpanded((v) => !v)}
				/>

				{/* Simple text: "Browser Session - 28/28" */}
				<span
					onClick={() => setNextActionsExpanded((v) => !v)}
					style={{
						flex: 1,
						fontSize: 13,
						fontWeight: 500,
						lineHeight: "22px",
						color: "var(--vscode-editor-foreground)",
						cursor: "pointer",
					}}>
					{t("chat:browser.session")}
					{pages.length > 1 && ` - ${currentPageIndex + 1}/${pages.length}`}
				</span>

				{/* Right side: cost badge and chevron */}
				{totalApiCost > 0 && (
					<div
						className="text-xs text-vscode-dropdown-foreground border-vscode-dropdown-border/50 border px-1.5 py-0.5 rounded-lg"
						style={{
							opacity: 0.4,
							height: "22px",
							display: "flex",
							alignItems: "center",
						}}>
						${totalApiCost.toFixed(4)}
					</div>
				)}

				{/* Chevron toggle - outside cost badge, matching "Browser Session" text style */}
				<span
					onClick={() => setNextActionsExpanded((v) => !v)}
					className={`codicon codicon-chevron-${nextActionsExpanded ? "up" : "down"}`}
					style={{
						fontSize: 13,
						fontWeight: 500,
						lineHeight: "22px",
						color: "var(--vscode-editor-foreground)",
						cursor: "pointer",
					}}
				/>

				{/* Kill browser button - only visible when session is active, styled like terminal kill button */}
				{isBrowserSessionOpen && (
					<StandardTooltip content="Disconnect session">
						<Button
							variant="ghost"
							size="icon"
							onClick={(e) => {
								e.stopPropagation()
								vscode.postMessage({ type: "killBrowserSession" })
							}}
							aria-label="Disconnect session">
							<OctagonX className="size-4" />
						</Button>
					</StandardTooltip>
				)}
			</div>

			{/* Expanded drawer content - overlays on top of chat */}
			{nextActionsExpanded && (
				<div
					style={{
						position: "absolute",
						top: "100%",
						left: 0,
						right: 0,
						marginTop: 4,
						background: "var(--vscode-editor-background)",
						border: "1px solid var(--vscode-panel-border)",
						borderRadius: 6,
						overflow: "hidden",
						boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
						zIndex: 1000,
					}}>
					{/* URL Bar with Navigation */}
					<div
						style={{
							padding: "5px 10px",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							color: "var(--vscode-descriptionForeground)",
							fontSize: "12px",
							gap: "8px",
							borderBottom: "1px solid var(--vscode-panel-border)",
							background: "var(--vscode-editor-background)",
						}}>
						{pages.length > 1 ? (
							<button
								onClick={(e) => {
									e.stopPropagation()
									setCurrentPageIndex((i) => Math.max(0, i - 1))
								}}
								disabled={currentPageIndex === 0 || isBrowsing}
								style={{
									background: "none",
									border: "none",
									cursor: currentPageIndex === 0 || isBrowsing ? "not-allowed" : "pointer",
									opacity: currentPageIndex === 0 || isBrowsing ? 0.3 : 0.7,
									padding: "4px",
									display: "flex",
									alignItems: "center",
									color: "inherit",
								}}
								aria-label="Previous page">
								<span className="codicon codicon-chevron-left" style={{ fontSize: "16px" }} />
							</button>
						) : (
							<div style={{ width: "24px" }} />
						)}
						<div
							style={{
								cursor: "default",
								flex: 1,
								textAlign: "center",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								gap: "6px",
								overflow: "hidden",
							}}>
							<Globe className="w-3 h-3 shrink-0 opacity-50" />
							<span
								style={{
									textOverflow: "ellipsis",
									overflow: "hidden",
									whiteSpace: "nowrap",
								}}>
								{displayState.url || "http"}
							</span>
						</div>
						{pages.length > 1 ? (
							<button
								onClick={(e) => {
									e.stopPropagation()
									setCurrentPageIndex((i) => Math.min(pages.length - 1, i + 1))
								}}
								disabled={currentPageIndex === pages.length - 1 || isBrowsing}
								style={{
									background: "none",
									border: "none",
									cursor:
										currentPageIndex === pages.length - 1 || isBrowsing ? "not-allowed" : "pointer",
									opacity: currentPageIndex === pages.length - 1 || isBrowsing ? 0.3 : 0.7,
									padding: "4px",
									display: "flex",
									alignItems: "center",
									color: "inherit",
								}}
								aria-label="Next page">
								<span className="codicon codicon-chevron-right" style={{ fontSize: "16px" }} />
							</button>
						) : (
							<div style={{ width: "24px" }} />
						)}
					</div>

					{/* Screenshot Area */}
					<div
						data-testid="screenshot-container"
						style={{
							width: "100%",
							paddingBottom: `${drawerAspectRatio.toFixed(2)}%`,
							position: "relative",
							backgroundColor: "var(--vscode-input-background)",
							borderBottom: "1px solid var(--vscode-panel-border)",
						}}>
						{displayState.screenshot ? (
							<img
								src={displayState.screenshot}
								alt={t("chat:browser.screenshot")}
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: "100%",
									objectFit: "contain",
									cursor: "pointer",
								}}
								onClick={() =>
									vscode.postMessage({
										type: "openImage",
										text: displayState.screenshot,
									})
								}
							/>
						) : (
							<div
								style={{
									position: "absolute",
									top: "50%",
									left: "50%",
									transform: "translate(-50%, -50%)",
								}}>
								<span
									className="codicon codicon-globe"
									style={{ fontSize: "80px", color: "var(--vscode-descriptionForeground)" }}
								/>
							</div>
						)}
						{displayState.mousePosition && (
							<BrowserCursor
								style={{
									position: "absolute",
									// Scale cursor position from viewport to fixed drawer dimensions
									// Use dimensions from the same page as the screenshot/mouse position
									top: `${(parseInt(mousePosition.split(",")[1]) / cursorViewportHeight) * 100}%`,
									left: `${(parseInt(mousePosition.split(",")[0]) / cursorViewportWidth) * 100}%`,
									transition: "top 0.3s ease-out, left 0.3s ease-out",
								}}
							/>
						)}
					</div>

					{/* Browser Action Row - moved above Console Logs */}
					<div
						style={{
							padding: "8px 10px",
							display: "flex",
							alignItems: "center",
							gap: "8px",
							borderBottom: "1px solid var(--vscode-panel-border)",
							background: "var(--vscode-editor-background)",
							fontSize: "12px",
							color: "var(--vscode-descriptionForeground)",
						}}>
						{isSessionActive ? (
							<ProgressIndicator />
						) : currentPageAction ? (
							getActionIcon(currentPageAction.action)
						) : (
							<Play className="w-4 h-4 opacity-80" />
						)}
						<span style={{ flex: 1 }}>
							{(() => {
								// Show action for current page being viewed
								const action = currentPageAction
								const pageSize = pages[currentPageIndex]?.size
								if (action) {
									return getBrowserActionText(action.action, action.coordinate, action.text, pageSize)
								} else if (initialUrl) {
									return getBrowserActionText("launch", undefined, initialUrl, undefined)
								}
								return t("chat:browser.rooWantsToUse")
							})()}
						</span>
					</div>

					{/* Console Logs Section (collapsible, default collapsed) */}
					<div
						style={{
							padding: "8px 10px",
						}}>
						<div
							onClick={(e) => {
								e.stopPropagation()
								setConsoleLogsExpanded((v) => !v)
							}}
							className="text-vscode-editor-foreground/70 hover:text-vscode-editor-foreground transition-colors"
							style={{
								display: "flex",
								alignItems: "center",
								gap: "8px",
								marginBottom: consoleLogsExpanded ? "6px" : 0,
								cursor: "pointer",
							}}>
							<SquareTerminal className="w-3" />
							<span className="text-xs" style={{ fontWeight: 500 }}>
								{t("chat:browser.consoleLogs")}
							</span>
							<span
								className={`codicon codicon-chevron-${consoleLogsExpanded ? "down" : "right"}`}
								style={{ marginLeft: "auto" }}
							/>
						</div>
						{consoleLogsExpanded && (
							<div style={{ marginTop: "6px" }}>
								<CodeBlock
									source={displayState.consoleLogs || t("chat:browser.noNewLogs")}
									language="shell"
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)

	// Height change effect
	useEffect(() => {
		const isInitialRender = prevHeightRef.current === 0
		if (isLast && rowHeight !== 0 && rowHeight !== Infinity && rowHeight !== prevHeightRef.current) {
			if (!isInitialRender) {
				onHeightChange(rowHeight > prevHeightRef.current)
			}
			prevHeightRef.current = rowHeight
		}
	}, [rowHeight, isLast, onHeightChange])

	return browserSessionRow
}, deepEqual)

const BrowserCursor: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
	const { t } = useTranslation()
	// (can't use svgs in vsc extensions)
	const cursorBase64 =
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAFaADAAQAAAABAAAAGAAAAADwi9a/AAADGElEQVQ4EZ2VbUiTURTH772be/PxZdsz3cZwC4RVaB8SAjMpxQwSWZbQG/TFkN7oW1Df+h6IRV9C+hCpKUSIZUXOfGM5tAKViijFFEyfZ7Ol29S1Pbdzl8Uw9+aBu91zzv3/nt17zt2DEZjBYOAkKrtFMXIghAWM8U2vMN/FctsxGRMpM7NbEEYNMM2CYUSInlJx3OpawO9i+XSNQYkmk2uFb9njzkcfVSr1p/GJiQKMULVaw2WuBv296UKRxWJR6wxGCmM1EAhSNppv33GBH9qI32cPTAtss9lUm6EM3N7R+RbigT+5/CeosFCZKpjEW+iorS1pb30wDUXzQfHqtD/9L3ieZ2ee1OJCmbL8QHnRs+4uj0wmW4QzrpCwvJ8zGg3JqAmhTLynuLiwv8/5KyND8Q3cEkUEDWu15oJE4KRQJt5hs1rcriGNRqP+DK4dyyWXXm/aFQ+cEpSJ8/LyDGPuEZNOmzsOroUSOqzXG/dtBU4ZysTZYKNut91sNo2Cq6cE9enz86s2g9OCMrFSqVC5hgb32u072W3jKMU90Hb1seC0oUwsB+t92bO/rKx0EFGkgFCnjjc1/gVvC8rE0L+4o63t4InjxwbAJQjTe3qD8QrLkXA4DC24fWtuajp06cLFYSBIFKGmXKPRRmAnME9sPt+yLwIWb9WN69fKoTneQz4Dh2mpPNkvfeV0jjecb9wNAkwIEVQq5VJOds4Kb+DXoAsiVquVwI1Dougpij6UyGYx+5cKroeDEFibm5lWRRMbH1+npmYrq6qhwlQHIbajZEf1fElcqGGFpGg9HMuKzpfBjhytCTMgkJ56RX09zy/ysENTBElmjIgJnmNChJqohDVQqpEfwkILE8v/o0GAnV9F1eEvofVQCbiTBEXOIPQh5PGgefDZeAcjrpGZjULBr/m3tZOnz7oEQWRAQZLjWlEU/XEJWySiILgRc5Cz1DkcAyuBFcnpfF0JiXWKpcolQXizhS5hKAqFpr0MVbgbuxJ6+5xX+P4wNpbqPPrugZfbmIbLmgQR3Aw8QSi66hUXulOFbF73GxqjE5BNXWNeAAAAAElFTkSuQmCC"

	return (
		<img
			src={cursorBase64}
			style={{
				width: "17px",
				height: "22px",
				...style,
			}}
			alt={t("chat:browser.cursor")}
			aria-label={t("chat:browser.cursor")}
		/>
	)
}

export default BrowserSessionRow
