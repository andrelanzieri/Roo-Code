import React, { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import MarkdownBlock from "../common/MarkdownBlock"
import { Clock, Lightbulb, ChevronDown, ChevronUp } from "lucide-react"
import { ToolUseBlock } from "../common/ToolUseBlock"

interface ReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	metadata?: any
	isExpanded?: boolean
	onToggleExpand?: () => void
}

/**
 * Render reasoning with a heading and a simple timer.
 * - Heading uses i18n key chat:reasoning.thinking
 * - Timer runs while reasoning is active (no persistence)
 * - Content can be collapsed/expanded for better performance
 */
export const ReasoningBlock = ({
	content,
	isStreaming,
	isLast,
	isExpanded: externalIsExpanded,
	onToggleExpand,
}: ReasoningBlockProps) => {
	const { t } = useTranslation()

	const startTimeRef = useRef<number>(Date.now())
	const [elapsed, setElapsed] = useState<number>(0)

	// Use internal state if no external control is provided
	const [internalIsExpanded, setInternalIsExpanded] = useState(false)
	const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded
	const toggleExpand = onToggleExpand || (() => setInternalIsExpanded(!internalIsExpanded))

	// Simple timer that runs while streaming
	useEffect(() => {
		if (isLast && isStreaming) {
			const tick = () => setElapsed(Date.now() - startTimeRef.current)
			tick()
			const id = setInterval(tick, 1000)
			return () => clearInterval(id)
		}
	}, [isLast, isStreaming])

	const seconds = Math.floor(elapsed / 1000)
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })
	const hasContent = (content?.trim()?.length ?? 0) > 0

	return (
		<ToolUseBlock>
			<div
				className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-vscode-list-hoverBackground"
				onClick={toggleExpand}>
				<div className="flex items-center gap-2">
					<Lightbulb className="w-4" />
					<span className="font-bold text-vscode-foreground">{t("chat:reasoning.thinking")}</span>
				</div>
				<div className="flex items-center gap-2">
					{elapsed > 0 && (
						<span className="text-vscode-foreground tabular-nums flex items-center gap-1">
							<Clock className="w-4" />
							{secondsLabel}
						</span>
					)}
					{hasContent &&
						(isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />)}
				</div>
			</div>
			{hasContent && isExpanded && (
				<div className="px-4 py-2 italic text-vscode-descriptionForeground border-t border-vscode-panel-border">
					<MarkdownBlock markdown={content} />
				</div>
			)}
		</ToolUseBlock>
	)
}
