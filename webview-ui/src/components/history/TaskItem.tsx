import { memo } from "react"
import type { HistoryItem } from "@roo-code/types"

import { vscode } from "@/utils/vscode"
import { cn } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"

import TaskItemFooter from "./TaskItemFooter"

interface DisplayHistoryItem extends HistoryItem {
	highlight?: string
	level?: number
	children?: DisplayHistoryItem[]
}

interface TaskItemProps {
	item: DisplayHistoryItem
	variant: "compact" | "full"
	showWorkspace?: boolean
	isSelectionMode?: boolean
	isSelected?: boolean
	onToggleSelection?: (taskId: string, isSelected: boolean) => void
	onDelete?: (taskId: string) => void
	className?: string
	isHierarchical?: boolean
	level?: number
	hasChildren?: boolean
	isExpanded?: boolean
	onToggleExpanded?: () => void
}

const TaskItem = ({
	item,
	variant,
	showWorkspace = false,
	isSelectionMode = false,
	isSelected = false,
	onToggleSelection,
	onDelete,
	className,
	isHierarchical = false,
	level = 0,
	hasChildren = false,
	isExpanded = false,
	onToggleExpanded,
}: TaskItemProps) => {
	const handleClick = () => {
		if (isSelectionMode && onToggleSelection) {
			onToggleSelection(item.id, !isSelected)
		} else if (!isHierarchical || !hasChildren) {
			vscode.postMessage({ type: "showTaskWithId", text: item.id })
		}
	}

	const handleExpandClick = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (onToggleExpanded) {
			onToggleExpanded()
		}
	}

	const isCompact = variant === "compact"

	return (
		<div
			key={item.id}
			data-testid={`task-item-${item.id}`}
			className={cn(
				"cursor-pointer group bg-vscode-editor-background rounded relative overflow-hidden border border-transparent hover:bg-vscode-list-hoverBackground transition-colors",
				className,
			)}
			style={isHierarchical ? { marginLeft: `${level * 24}px` } : undefined}
			onClick={handleClick}>
			<div className={(!isCompact && isSelectionMode ? "pl-3 pb-3" : "pl-4") + " flex gap-3 px-3 pt-3 pb-1"}>
				{/* Expand/collapse button for hierarchical view */}
				{isHierarchical && hasChildren && (
					<button
						className="flex items-center justify-center w-5 h-5 mt-1 hover:bg-vscode-list-hoverBackground rounded"
						onClick={handleExpandClick}
						aria-label={isExpanded ? "Collapse" : "Expand"}>
						<span
							className={cn(
								"codicon",
								isExpanded ? "codicon-chevron-down" : "codicon-chevron-right",
								"text-xs",
							)}
						/>
					</button>
				)}

				{/* Spacer for items without children in hierarchical view */}
				{isHierarchical && !hasChildren && <div className="w-5" />}

				{/* Selection checkbox - only in full variant */}
				{!isCompact && isSelectionMode && (
					<div
						className="task-checkbox mt-1"
						onClick={(e) => {
							e.stopPropagation()
						}}>
						<Checkbox
							checked={isSelected}
							onCheckedChange={(checked: boolean) => onToggleSelection?.(item.id, checked === true)}
							variant="description"
						/>
					</div>
				)}

				<div className="flex-1 min-w-0">
					<div
						className={cn(
							"overflow-hidden whitespace-pre-wrap text-vscode-foreground text-ellipsis line-clamp-2",
							{
								"text-base": !isCompact,
							},
							!isCompact && isSelectionMode ? "mb-1" : "",
						)}
						data-testid="task-content"
						{...(item.highlight ? { dangerouslySetInnerHTML: { __html: item.highlight } } : {})}>
						{item.highlight ? undefined : item.task}
					</div>
					<TaskItemFooter
						item={item}
						variant={variant}
						isSelectionMode={isSelectionMode}
						onDelete={onDelete}
					/>

					{showWorkspace && item.workspace && (
						<div className="flex flex-row gap-1 text-vscode-descriptionForeground text-xs mt-1">
							<span className="codicon codicon-folder scale-80" />
							<span>{item.workspace}</span>
						</div>
					)}
				</div>
			</div>
		</div>
	)
}

export default memo(TaskItem)
