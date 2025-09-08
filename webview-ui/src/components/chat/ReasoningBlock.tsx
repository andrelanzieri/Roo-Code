import React, { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import MarkdownBlock from "../common/MarkdownBlock"
import { vscode } from "@src/utils/vscode"

interface ReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	metadata?: Record<string, any>
}

/**
 * Render reasoning with a heading and a persistent timer.
 * - Heading uses i18n key chat:reasoning.thinking
 * - Timer shown as "(⟲ 24s)" beside the heading and persists via message.metadata.reasoning { startedAt, elapsedMs }
 */
export const ReasoningBlock = ({ content, ts, isStreaming, isLast, metadata }: ReasoningBlockProps) => {
	const { t } = useTranslation()

	const persisted = (metadata?.reasoning as { startedAt?: number; elapsedMs?: number } | undefined) || {}
	const startedAtRef = useRef<number>(persisted.startedAt ?? Date.now())
	const [elapsed, setElapsed] = useState<number>(persisted.elapsedMs ?? 0)

	// Initialize startedAt on first mount if missing (persist to task)
	useEffect(() => {
		if (!persisted.startedAt && isLast) {
			vscode.postMessage({
				type: "updateMessageReasoningMeta",
				messageTs: ts,
				reasoningMeta: { startedAt: startedAtRef.current },
			} as any)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ts])

	// Tick while active (last row and streaming)
	useEffect(() => {
		const active = isLast && isStreaming
		if (!active) return

		const tick = () => setElapsed(Date.now() - startedAtRef.current)
		tick()
		const id = setInterval(tick, 1000)
		return () => clearInterval(id)
	}, [isLast, isStreaming])

	// Persist final elapsed when streaming stops
	const wasActiveRef = useRef<boolean>(false)
	useEffect(() => {
		const active = isLast && isStreaming
		if (wasActiveRef.current && !active) {
			const finalMs = Date.now() - startedAtRef.current
			setElapsed(finalMs)
			vscode.postMessage({
				type: "updateMessageReasoningMeta",
				messageTs: ts,
				reasoningMeta: { startedAt: startedAtRef.current, elapsedMs: finalMs },
			} as any)
		}
		wasActiveRef.current = active
	}, [isLast, isStreaming, ts])

	const displayMs = useMemo(() => {
		if (isLast && isStreaming) return elapsed
		return persisted.elapsedMs ?? elapsed
	}, [elapsed, isLast, isStreaming, persisted.elapsedMs])

	const seconds = Math.max(0, Math.floor((displayMs || 0) / 1000))
	const secondsLabel = t("chat:reasoning.seconds", { count: seconds })

	return (
		<div className="px-3 py-1">
			<div className="flex items-center gap-2 mb-1">
				<span className="codicon codicon-light-bulb text-muted-foreground" />
				<span className="font-medium text-vscode-foreground">{t("chat:reasoning.thinking")}</span>
				<span className="font-medium text-vscode-foreground tabular-nums flex items-center gap-1">
					<span className="codicon codicon-history" style={{ fontSize: "inherit" }} />
					{secondsLabel}
				</span>
			</div>
			<div className="italic text-muted-foreground">
				<MarkdownBlock markdown={content} />
			</div>
		</div>
	)
}
