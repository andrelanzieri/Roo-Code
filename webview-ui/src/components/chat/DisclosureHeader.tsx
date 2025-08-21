import React from "react"
import { cn } from "@/lib/utils"
import { IconButton } from "./IconButton"

interface DisclosureHeaderProps {
	contentId: string
	iconClass: string
	iconStyle?: React.CSSProperties
	title: React.ReactNode
	expanded: boolean
	onToggle: () => void
	onCopy?: (e: React.MouseEvent) => void
	copyTitle?: string
	copyIconClass?: string // e.g. "codicon-copy" | "codicon-check"
	className?: string
}

export const DisclosureHeader: React.FC<DisclosureHeaderProps> = ({
	contentId,
	iconClass,
	iconStyle,
	title,
	expanded,
	onToggle,
	onCopy,
	copyTitle,
	copyIconClass,
	className,
}) => {
	return (
		<div
			className={cn("flex items-center justify-between", className)}
			style={{
				fontWeight: "normal",
				fontSize: "var(--vscode-font-size)",
				color: "var(--vscode-editor-foreground)",
				borderBottom: expanded ? "1px solid var(--vscode-editorGroup-border)" : "none",
			}}>
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={contentId}
				onClick={onToggle}
				className={cn(
					"flex items-center justify-between gap-2",
					"bg-transparent border-0 p-0 m-0 cursor-pointer",
					"focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder",
				)}
				style={{ width: "100%", textAlign: "left" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "10px", flexGrow: 1 }}>
					<span
						className={cn("codicon", iconClass)}
						style={{ fontSize: 16, marginBottom: "-1.5px", ...iconStyle }}
					/>
					<span>{title}</span>
				</div>
				<span className={`codicon codicon-chevron-${expanded ? "down" : "right"}`} />
			</button>

			{onCopy && (
				<IconButton
					iconClass={copyIconClass ?? "codicon-copy"}
					title={copyTitle ?? "Copy"}
					onClick={(e) => {
						e.stopPropagation()
						onCopy(e)
					}}
					style={{ marginLeft: 4 }}
				/>
			)}
		</div>
	)
}
