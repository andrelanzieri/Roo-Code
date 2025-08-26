import type { GlobalSettings } from "@roo-code/types"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { cn } from "@/lib/utils"
import { StandardTooltip } from "@/components/ui"
import { autoApproveSettingsConfig, AutoApproveSetting } from "../settings/AutoApproveToggle"

type AutoApproveToggles = Pick<
	GlobalSettings,
	| "alwaysAllowReadOnly"
	| "alwaysAllowWrite"
	| "alwaysAllowBrowser"
	| "alwaysApproveResubmit"
	| "alwaysAllowMcp"
	| "alwaysAllowModeSwitch"
	| "alwaysAllowSubtasks"
	| "alwaysAllowExecute"
	| "alwaysAllowFollowupQuestions"
	| "alwaysAllowUpdateTodoList"
>

type AutoApproveToggleDropdownProps = AutoApproveToggles & {
	onToggle: (key: AutoApproveSetting, value: boolean) => void
}

// Keyboard shortcuts mapping
const KEYBOARD_SHORTCUTS: Record<AutoApproveSetting, string> = {
	alwaysAllowReadOnly: "Alt+1",
	alwaysAllowWrite: "Alt+2",
	alwaysAllowBrowser: "Alt+3",
	alwaysAllowExecute: "Alt+4",
	alwaysAllowMcp: "Alt+5",
	alwaysAllowModeSwitch: "Alt+6",
	alwaysAllowSubtasks: "Alt+7",
	alwaysAllowFollowupQuestions: "Alt+8",
	alwaysAllowUpdateTodoList: "Alt+9",
	alwaysApproveResubmit: "Alt+0",
}

export const AutoApproveToggleDropdown = ({ onToggle, ...props }: AutoApproveToggleDropdownProps) => {
	const { t } = useAppTranslation()

	// Split settings into two columns for better layout
	const settings = Object.values(autoApproveSettingsConfig)
	const halfLength = Math.ceil(settings.length / 2)
	const leftColumn = settings.slice(0, halfLength)
	const rightColumn = settings.slice(halfLength)

	const renderToggleItem = ({
		key,
		descriptionKey,
		labelKey,
		icon,
		testId,
	}: (typeof autoApproveSettingsConfig)[AutoApproveSetting]) => {
		const tooltipContent = `${t(descriptionKey || "")} (${KEYBOARD_SHORTCUTS[key]})`
		return (
			<StandardTooltip key={key} content={tooltipContent}>
				<button
					onClick={() => onToggle(key, !props[key])}
					aria-label={t(labelKey)}
					aria-pressed={!!props[key]}
					data-testid={testId}
					className={cn(
						"w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left",
						"transition-colors hover:bg-vscode-list-hoverBackground",
						props[key]
							? "bg-vscode-list-activeSelectionBackground text-vscode-list-activeSelectionForeground"
							: "opacity-70",
					)}>
					<span className={cn("codicon", `codicon-${icon}`, "text-sm flex-shrink-0")} />
					<span className="flex-1 truncate">{t(labelKey)}</span>
					<span
						className={cn(
							"text-[10px] px-1 rounded",
							props[key] ? "bg-vscode-badge-background text-vscode-badge-foreground" : "",
						)}>
						{props[key] ? "✓" : ""}
					</span>
				</button>
			</StandardTooltip>
		)
	}

	return (
		<>
			<div className="flex flex-col gap-1">{leftColumn.map(renderToggleItem)}</div>
			<div className="flex flex-col gap-1">{rightColumn.map(renderToggleItem)}</div>
		</>
	)
}
