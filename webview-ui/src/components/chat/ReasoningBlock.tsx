import React, { memo, useState, useEffect } from "react"
import { useTranslation } from "react-i18next"

import MarkdownBlock from "../common/MarkdownBlock"
import { Lightbulb } from "lucide-react"
import { ElapsedTime } from "./ElapsedTime"

interface ReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	isExpanded?: boolean
	metadata?: any
}

/**
 * Render reasoning with a heading and a simple timer.
 * - Heading uses i18n key chat:reasoning.thinking
 * - Timer is isolated in ElapsedTime component to prevent parent re-renders
 * - Content is debounced during streaming to reduce re-render frequency
 */
export const ReasoningBlock = memo(({ content, isStreaming, isLast, isExpanded = false }: ReasoningBlockProps) => {
	const { t } = useTranslation()

	// Debounce content updates during streaming
	const [debouncedContent, setDebouncedContent] = useState(content)

	useEffect(() => {
		if (isStreaming) {
			// Debounce content updates to ~10 updates per second max
			const timer = setTimeout(() => {
				setDebouncedContent(content)
			}, 100)
			return () => clearTimeout(timer)
		} else {
			// Immediately update when streaming ends
			setDebouncedContent(content)
		}
	}, [content, isStreaming])

	// Only render markdown if expanded and content exists
	const shouldRenderMarkdown = isExpanded && (debouncedContent?.trim()?.length ?? 0) > 0

	return (
		<div>
			<div className="flex items-center justify-between mb-2.5 pr-2">
				<div className="flex items-center gap-2">
					<Lightbulb className="w-4" />
					<span className="font-bold text-vscode-foreground">{t("chat:reasoning.thinking")}</span>
				</div>
				<ElapsedTime isStreaming={isStreaming} isLast={isLast} />
			</div>
			{shouldRenderMarkdown && (
				<div className="border-l border-vscode-descriptionForeground/20 ml-2 pl-4 pb-1 text-vscode-descriptionForeground">
					<MarkdownBlock markdown={debouncedContent} />
				</div>
			)}
		</div>
	)
})

ReasoningBlock.displayName = "ReasoningBlock"
