import { memo, useMemo, useState, useEffect } from "react"
import { ClineMessage } from "@roo-code/types"
import { ClineSayBrowserAction, BrowserActionResult } from "@roo/ExtensionMessage"
import { vscode } from "@src/utils/vscode"
import {
	MousePointer as MousePointerIcon,
	Keyboard,
	ArrowDown,
	ArrowUp,
	Pointer,
	Play,
	Check,
	SquareTerminal,
	Globe,
	Maximize2,
} from "lucide-react"
import CodeBlock from "../common/CodeBlock"
import { useTranslation } from "react-i18next"
import { useExtensionState } from "@src/context/ExtensionStateContext"

const BrowserCursor: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
	const { t } = useTranslation()
	// Base64 encoded cursor image (same as BrowserSessionRow)
	const cursorBase64 =
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABUAAAAYCAYAAAAVibZIAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAFaADAAQAAAABAAAAGAAAAADwi9a/AAADGElEQVQ4EZ2VbUiTURTH772be/PxZdsz3cZwC4RVaB8SAjMpxQwSWZbQG/TFkN7oW1Df+h6IRV9C+hCpKUSIZUXOfGM5tAKViijFFEyfZ7Ol29S1Pbdzl8Uw9+aBu91zzv3/nt17zt2DEZjBYOAkKrtFMXIghAWM8U2vMN/FctsxGRMpM7NbEEYNMM2CYUSInlJx3OpawO9i+XSNQYkmk2uFb9njzkcfVSr1p/GJiQKMULVaw2WuBv296UKRxWJR6wxGCmM1EAhSNppv33GBH9qI32cPTAtss9lUm6EM3N7R+RbigT+5/CeosFCZKpjEW+iorS1pb30wDUXzQfHqtD/9L3ieZ2ee1OJCmbL8QHnRs+4uj0wmW4QzrpCwvJ8zGg3JqAmhTLynuLiwv8/5KyND8Q3cEkUEDWu15oJE4KRQJt5hs1rcriGNRqP+DK4dyyWXXm/aFQ+cEpSJ8/LyDGPuEZNOmzsOroUSOqzXG/dtBU4ZysTZYKNut91sNo2Cq6cE9enz86s2g9OCMrFSqVC5hgb32u072W3jKMU90Hb1seC0oUwsB+t92bO/rKx0EFGkgFCnjjc1/gVvC8rE0L+4o63t4InjxwbAJQjTe3qD8QrLkXA4DC24fWtuajp06cLFYSBIFKGmXKPRRmAnME9sPt+yLwIWb9WN69fKoTneQz4Dh2mpPNkvfeV0jjecb9wNAkwIEVQq5VJOds4Kb+DXoAsiVquVwI1Dougpij6UyGYx+5cKroeDEFibm5lWRRMbH1+npmYrq6qhwlQHIbajZEf1fElcqGGFpGg9HMuKzpfBjhytCTMgkJ56RX09zy/ysENTBElmjIgJnmNChJqohDVQqpEfwkILE8v/o0GAnV9F1eEvofVQCbiTBEXOIPQh5PGgefDZeAcjrpGZjULBr/m3tZOnz7oEQWRAQZLjWlEU/XEJWySiILgRc5Cz1DkcAyuBFcnpfF0JiXWKpsolQXizhS5hKAqFpr0MVbgbuxJ6+5xX+P4wNpbqPPrugZfbmIbLmgQR3Aw8QSi66hUXulOFbF73GxqjE5BNXWNeAAAAAElFTkSuQmCC"

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

interface BrowserActionRowProps {
	message: ClineMessage
	nextMessage?: ClineMessage
	actionIndex?: number
	totalActions?: number
}

// Get icon for each action type
const getActionIcon = (action: string) => {
	switch (action) {
		case "click":
			return <MousePointerIcon className="w-3.5 h-3.5 opacity-70" />
		case "type":
		case "press":
			return <Keyboard className="w-3.5 h-3.5 opacity-70" />
		case "scroll_down":
			return <ArrowDown className="w-3.5 h-3.5 opacity-70" />
		case "scroll_up":
			return <ArrowUp className="w-3.5 h-3.5 opacity-70" />
		case "launch":
			return <Play className="w-3.5 h-3.5 opacity-70" />
		case "close":
			return <Check className="w-3.5 h-3.5 opacity-70" />
		case "resize":
			return <Maximize2 className="w-3.5 h-3.5 opacity-70" />
		case "hover":
		default:
			return <Pointer className="w-3.5 h-3.5 opacity-70" />
	}
}

const BrowserActionRow = memo(({ message, nextMessage, actionIndex, totalActions }: BrowserActionRowProps) => {
	const { browserViewportSize = "900x600", browserActionsAutoExpand } = useExtensionState()
	const [isExpanded, setIsExpanded] = useState(browserActionsAutoExpand ?? false)
	const [isLogsExpanded, setIsLogsExpanded] = useState(false)

	// Update expanded state when setting changes
	useEffect(() => {
		setIsExpanded(browserActionsAutoExpand ?? false)
	}, [browserActionsAutoExpand])

	// Use default viewport size from settings
	const [defaultViewportWidth, defaultViewportHeight] = browserViewportSize.split("x").map(Number)

	// Parse this specific browser action
	const browserAction = useMemo<ClineSayBrowserAction | null>(() => {
		try {
			return JSON.parse(message.text || "{}") as ClineSayBrowserAction
		} catch {
			return null
		}
	}, [message.text])

	// Parse the result from the next message
	const actionResult = useMemo<BrowserActionResult | null>(() => {
		if (!nextMessage || nextMessage.say !== "browser_action_result") return null
		try {
			return JSON.parse(nextMessage.text || "{}") as BrowserActionResult
		} catch {
			return null
		}
	}, [nextMessage])

	// Use actual viewport dimensions from result if available, otherwise fall back to settings
	const viewportWidth = actionResult?.viewportWidth ?? defaultViewportWidth
	const viewportHeight = actionResult?.viewportHeight ?? defaultViewportHeight

	// Format action display text
	const actionText = useMemo(() => {
		if (!browserAction) return "Browser action"

		switch (browserAction.action) {
			case "launch":
				return `Launched browser`
			case "click":
				return `Clicked at: ${browserAction.coordinate}`
			case "type":
				return `Typed: ${browserAction.text}`
			case "press":
				return `Pressed key: ${prettyKey(browserAction.text)}`
			case "hover":
				return `Hovered at: ${browserAction.coordinate}`
			case "scroll_down":
				return "Scrolled down"
			case "scroll_up":
				return "Scrolled up"
			case "resize":
				return `Resized to: ${browserAction.size?.split(/[x,]/).join(" x ")}`
			case "close":
				return "Closed browser"
			default:
				return browserAction.action
		}
	}, [browserAction])

	const handleImageClick = () => {
		if (actionResult?.screenshot) {
			vscode.postMessage({
				type: "openImage",
				text: actionResult.screenshot,
			})
		}
	}

	const headerStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		marginBottom: "10px",
		wordBreak: "break-word",
	}

	const hasScreenshot = !!actionResult?.screenshot

	return (
		<div className="px-[15px] py-[10px] pr-[6px]">
			{/* Header with action description */}
			<div
				style={headerStyle}
				className={hasScreenshot ? "cursor-pointer" : ""}
				onClick={hasScreenshot ? () => setIsExpanded(!isExpanded) : undefined}>
				<span
					className="codicon codicon-globe text-vscode-testing-iconPassed shrink-0"
					style={{ marginBottom: "-1.5px" }}
				/>
				<span style={{ fontWeight: "bold" }}>Browser Action</span>
				{actionIndex !== undefined && totalActions !== undefined && (
					<span style={{ fontWeight: "bold" }}>
						{" "}
						- {actionIndex}/{totalActions} -{" "}
					</span>
				)}
				{browserAction && (
					<>
						<span className="shrink-0">{getActionIcon(browserAction.action)}</span>
						<span className="flex-1 truncate">{actionText}</span>
					</>
				)}
				{hasScreenshot && (
					<span
						className={`codicon codicon-chevron-${isExpanded ? "up" : "down"} shrink-0`}
						style={{ marginBottom: "-1.5px", fontSize: 16 }}
					/>
				)}
			</div>

			{/* Expanded content - only show if we have a screenshot */}
			{isExpanded && actionResult?.screenshot && (
				<div className="pl-6">
					<div
						className="border border-vscode-panel-border rounded overflow-hidden"
						style={{ backgroundColor: "var(--vscode-editor-background)" }}>
						{/* URL display with globe icon - centered */}
						{actionResult.currentUrl && (
							<div className="text-xs text-vscode-descriptionForeground py-2 px-3 border-b border-vscode-panel-border flex items-center justify-center gap-2">
								<Globe className="w-3 h-3 shrink-0 opacity-50" />
								<span style={{ wordBreak: "break-all", lineHeight: "1.4", textAlign: "center" }}>
									{actionResult.currentUrl}
								</span>
							</div>
						)}

						{/* Screenshot with cursor position */}
						<div
							className="relative cursor-pointer border-b border-vscode-panel-border"
							style={{
								backgroundColor: "var(--vscode-input-background)",
								paddingBottom: `${((viewportHeight / viewportWidth) * 100).toFixed(2)}%`,
								position: "relative",
							}}
							onClick={handleImageClick}>
							<img
								src={actionResult.screenshot}
								alt="Browser screenshot"
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: "100%",
									objectFit: "contain",
								}}
							/>
							{actionResult.currentMousePosition && (
								<BrowserCursor
									style={{
										position: "absolute",
										top: `${(parseInt(actionResult.currentMousePosition.split(",")[1]) / viewportHeight) * 100}%`,
										left: `${(parseInt(actionResult.currentMousePosition.split(",")[0]) / viewportWidth) * 100}%`,
										transition: "top 0.3s ease-out, left 0.3s ease-out",
									}}
								/>
							)}
						</div>

						{/* Console logs - matching BrowserSessionRow styling exactly */}
						<div style={{ padding: "8px 10px" }}>
							<div
								onClick={(e) => {
									e.stopPropagation()
									setIsLogsExpanded(!isLogsExpanded)
								}}
								className="text-vscode-editor-foreground/70 hover:text-vscode-editor-foreground transition-colors"
								style={{
									display: "flex",
									alignItems: "center",
									gap: "8px",
									marginBottom: isLogsExpanded ? "6px" : 0,
									cursor: "pointer",
								}}>
								<SquareTerminal className="w-3" />
								<span className="text-xs" style={{ fontWeight: 500 }}>
									Console Logs
								</span>
								<span
									className={`codicon codicon-chevron-${isLogsExpanded ? "down" : "right"}`}
									style={{ marginLeft: "auto" }}
								/>
							</div>
							{isLogsExpanded && (
								<div style={{ marginTop: "6px" }}>
									<CodeBlock source={actionResult?.logs || "(No new logs)"} language="shell" />
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
})

BrowserActionRow.displayName = "BrowserActionRow"

export default BrowserActionRow
