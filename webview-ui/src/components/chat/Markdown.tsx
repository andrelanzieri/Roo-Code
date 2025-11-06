import { memo, useState } from "react"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

import { useCopyToClipboard } from "@src/utils/clipboard"
import { StandardTooltip } from "@src/components/ui"
import { vscode } from "@src/utils/vscode"

import MarkdownBlock from "../common/MarkdownBlock"

interface MarkdownProps {
	markdown?: string
	partial?: boolean
	messageTs?: number
	onDeleteMessage?: () => void
}

export const Markdown = memo(({ markdown, partial, messageTs, onDeleteMessage }: MarkdownProps) => {
	const [isHovering, setIsHovering] = useState(false)

	// Shorter feedback duration for copy button flash.
	const { copyWithFeedback } = useCopyToClipboard(200)

	const handleDelete = () => {
		if (onDeleteMessage) {
			onDeleteMessage()
		} else if (messageTs) {
			vscode.postMessage({ type: "deleteMessage", value: messageTs })
		}
	}

	if (!markdown || markdown.length === 0) {
		return null
	}

	return (
		<div
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
			style={{ position: "relative" }}>
			<div style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
				<MarkdownBlock markdown={markdown} />
			</div>
			{markdown && !partial && isHovering && (
				<div
					style={{
						position: "absolute",
						bottom: "-4px",
						right: "8px",
						opacity: 0,
						animation: "fadeIn 0.2s ease-in-out forwards",
						borderRadius: "4px",
						display: "flex",
						gap: "4px",
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
					{(messageTs || onDeleteMessage) && (
						<StandardTooltip content="Delete message">
							<VSCodeButton
								className="delete-button"
								appearance="icon"
								style={{
									height: "24px",
									border: "none",
									background: "var(--vscode-editor-background)",
									transition: "background 0.2s ease-in-out",
								}}
								onClick={handleDelete}>
								<span className="codicon codicon-trash" />
							</VSCodeButton>
						</StandardTooltip>
					)}
				</div>
			)}
		</div>
	)
})
