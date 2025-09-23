import React, { memo, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface ElapsedTimeProps {
	isStreaming: boolean
	isLast: boolean
}

/**
 * Isolated timer component that updates independently from parent.
 * This prevents the entire ReasoningBlock from re-rendering every second.
 */
export const ElapsedTime = memo(({ isStreaming, isLast }: ElapsedTimeProps) => {
	const { t } = useTranslation()
	const startTimeRef = useRef<number>(Date.now())
	const [elapsed, setElapsed] = useState<number>(0)

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

	if (elapsed === 0) {
		return null
	}

	return (
		<span className="text-sm text-vscode-descriptionForeground tabular-nums flex items-center gap-1">
			{secondsLabel}
		</span>
	)
})

ElapsedTime.displayName = "ElapsedTime"
