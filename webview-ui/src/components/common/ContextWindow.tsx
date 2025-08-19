import { useCallback } from "react"
import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"

import type { ModelInfo } from "@roo-code/types"

type ContextWindowProps = {
	customModelInfo?: ModelInfo | null
	defaultContextWindow?: number
	onContextWindowChange: (contextWindow: number | undefined) => void
	label?: string
	placeholder?: string
	helperText?: string
}

const inputEventTransform = (event: any) => (event as { target: HTMLInputElement })?.target?.value

export const ContextWindow = ({
	customModelInfo,
	defaultContextWindow,
	onContextWindowChange,
	label,
	placeholder,
	helperText,
}: ContextWindowProps) => {
	const handleContextWindowChange = useCallback(
		(event: any) => {
			const value = inputEventTransform(event)?.trim()

			if (value === "") {
				// Clear custom context window
				onContextWindowChange(undefined)
			} else {
				const numValue = parseInt(value, 10)
				if (!isNaN(numValue) && numValue > 0) {
					onContextWindowChange(numValue)
				}
			}
		},
		[onContextWindowChange],
	)

	const currentValue = customModelInfo?.contextWindow?.toString() || ""
	const placeholderText = placeholder || defaultContextWindow?.toString() || "128000"
	const labelText = label || "Context Window Size"
	const helperTextContent = helperText || "Custom context window size in tokens (leave empty to use default)"

	return (
		<>
			<VSCodeTextField
				value={currentValue}
				onInput={handleContextWindowChange}
				placeholder={placeholderText}
				className="w-full">
				<label className="block font-medium mb-1">{labelText}</label>
			</VSCodeTextField>
			{helperTextContent && (
				<div className="text-sm text-vscode-descriptionForeground -mt-2">{helperTextContent}</div>
			)}
		</>
	)
}
