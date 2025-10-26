import { memo, useState, useEffect, useRef } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { MessageSquareQuote } from "lucide-react"

import { useCopyToClipboard } from "@src/utils/clipboard"
import { StandardTooltip } from "@src/components/ui"
import { vscode } from "@src/utils/vscode"

import MarkdownBlock from "../common/MarkdownBlock"

export const Markdown = memo(
	({ markdown, partial, messageTs }: { markdown?: string; partial?: boolean; messageTs?: number }) => {
		const [isHovering, setIsHovering] = useState(false)
		const [selectedText, setSelectedText] = useState("")
		const [quoteButtonPosition, setQuoteButtonPosition] = useState<{ top: number; left: number } | null>(null)
		const containerRef = useRef<HTMLDivElement>(null)

		// Shorter feedback duration for copy button flash.
		const { copyWithFeedback } = useCopyToClipboard(200)

		// Handle text selection
		useEffect(() => {
			const handleSelectionChange = () => {
				const selection = window.getSelection()
				if (!selection || selection.isCollapsed || !containerRef.current) {
					setSelectedText("")
					setQuoteButtonPosition(null)
					return
				}

				// Check if selection is within our container
				const range = selection.getRangeAt(0)
				const commonAncestor = range.commonAncestorContainer
				const isInContainer = containerRef.current.contains(commonAncestor)

				if (isInContainer) {
					const text = selection.toString().trim()
					if (text) {
						setSelectedText(text)

						// Get the selection bounds to position the quote button
						const rect = range.getBoundingClientRect()
						const containerRect = containerRef.current.getBoundingClientRect()

						// Position the button above and centered on the selection
						setQuoteButtonPosition({
							top: rect.top - containerRect.top - 36, // 36px above selection
							left: rect.left - containerRect.left + rect.width / 2 - 16, // centered (button is ~32px wide)
						})
					} else {
						setSelectedText("")
						setQuoteButtonPosition(null)
					}
				} else {
					setSelectedText("")
					setQuoteButtonPosition(null)
				}
			}

			// Listen for selection changes
			document.addEventListener("selectionchange", handleSelectionChange)

			return () => {
				document.removeEventListener("selectionchange", handleSelectionChange)
			}
		}, [])

		const handleQuoteClick = () => {
			if (selectedText) {
				// Send message to add quote to composer
				vscode.postMessage({
					type: "addQuoteToComposer",
					text: selectedText,
					messageTs: messageTs,
				})

				// Clear selection
				window.getSelection()?.removeAllRanges()
				setSelectedText("")
				setQuoteButtonPosition(null)
			}
		}

		if (!markdown || markdown.length === 0) {
			return null
		}

		return (
			<div
				ref={containerRef}
				onMouseEnter={() => setIsHovering(true)}
				onMouseLeave={() => setIsHovering(false)}
				style={{ position: "relative" }}>
				<div style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
					<MarkdownBlock markdown={markdown} />
				</div>

				{/* Quote button that appears on text selection */}
				{selectedText && quoteButtonPosition && !partial && (
					<div
						style={{
							position: "absolute",
							top: `${quoteButtonPosition.top}px`,
							left: `${quoteButtonPosition.left}px`,
							zIndex: 1000,
							animation: "fadeIn 0.15s ease-in-out forwards",
						}}>
						<StandardTooltip content="Quote selection to reply">
							<button
								onClick={handleQuoteClick}
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									width: "32px",
									height: "32px",
									borderRadius: "4px",
									border: "1px solid var(--vscode-widget-border)",
									background: "var(--vscode-button-background)",
									color: "var(--vscode-button-foreground)",
									cursor: "pointer",
									boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
									transition: "all 0.2s ease",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.background = "var(--vscode-button-hoverBackground)"
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.background = "var(--vscode-button-background)"
								}}>
								<MessageSquareQuote size={16} />
							</button>
						</StandardTooltip>
					</div>
				)}

				{/* Copy button that appears on hover */}
				{markdown && !partial && isHovering && (
					<div
						style={{
							position: "absolute",
							bottom: "-4px",
							right: "8px",
							opacity: 0,
							animation: "fadeIn 0.2s ease-in-out forwards",
							borderRadius: "4px",
						}}>
						<style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1.0; } }`}</style>
						<StandardTooltip content="Copy as markdown">
							<VSCodeButton
								className="copy-button"
								appearance="icon"
								style={{
									height: "24px",
									border: "none",
									background: "var(--vscode-editor-background)",
									transition: "background 0.2s ease-in-out",
								}}
								onClick={async () => {
									const success = await copyWithFeedback(markdown)
									if (success) {
										const button = document.activeElement as HTMLElement
										if (button) {
											button.style.background = "var(--vscode-button-background)"
											setTimeout(() => {
												button.style.background = ""
											}, 200)
										}
									}
								}}>
								<span className="codicon codicon-copy" />
							</VSCodeButton>
						</StandardTooltip>
					</div>
				)}
			</div>
		)
	},
)
