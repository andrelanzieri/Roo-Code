import React, { useState, useEffect, useContext } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible"
import { ExtensionStateContext } from "../../context/ExtensionStateContext"
import { ReasoningBlock } from "./ReasoningBlock"

interface CollapsibleReasoningBlockProps {
	content: string
	ts: number
	isStreaming: boolean
	isLast: boolean
	metadata?: any
}

export const CollapsibleReasoningBlock: React.FC<CollapsibleReasoningBlockProps> = ({
	content,
	ts,
	isStreaming,
	isLast,
	metadata,
}) => {
	const extensionState = useContext(ExtensionStateContext)
	const autoExpand = extensionState?.autoExpandReasoningBlocks ?? false

	// Start with the configured default state
	const [isOpen, setIsOpen] = useState(autoExpand)

	// Update when the setting changes
	useEffect(() => {
		setIsOpen(autoExpand)
	}, [autoExpand])

	// Extract first line or preview of the reasoning content
	const getPreviewText = () => {
		if (!content) return "Thinking..."
		const lines = content.split("\n").filter((line) => line.trim())
		if (lines.length === 0) return "Thinking..."

		// Get first meaningful line (skip empty lines)
		const firstLine = lines[0]
		const maxLength = 100

		if (firstLine.length > maxLength) {
			return firstLine.substring(0, maxLength) + "..."
		}
		return firstLine + (lines.length > 1 ? "..." : "")
	}

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div className="bg-vscode-editorWidget-background border border-vscode-editorWidget-border rounded-md overflow-hidden">
				<CollapsibleTrigger className="flex items-center justify-between w-full p-3 hover:bg-vscode-list-hoverBackground transition-colors">
					<div className="flex items-center gap-2">
						{isOpen ? (
							<ChevronDown className="h-4 w-4 text-vscode-descriptionForeground" />
						) : (
							<ChevronRight className="h-4 w-4 text-vscode-descriptionForeground" />
						)}
						<span className="text-sm font-medium text-vscode-descriptionForeground">Reasoning</span>
						{!isOpen && (
							<span className="text-sm text-vscode-descriptionForeground ml-2 truncate max-w-[500px]">
								{getPreviewText()}
							</span>
						)}
					</div>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<div className="border-t border-vscode-editorWidget-border">
						<ReasoningBlock
							content={content}
							ts={ts}
							isStreaming={isStreaming}
							isLast={isLast}
							metadata={metadata}
						/>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	)
}
