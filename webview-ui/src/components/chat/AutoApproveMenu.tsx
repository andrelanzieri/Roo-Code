import { memo, useCallback, useMemo, useState } from "react"
import { Trans } from "react-i18next"
import { VSCodeCheckbox, VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { Stamp, ListChecks, LayoutList } from "lucide-react"

import { vscode } from "@src/utils/vscode"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { useAppTranslation } from "@src/i18n/TranslationContext"
import { AutoApproveSetting, autoApproveSettingsConfig } from "../settings/AutoApproveToggle"
import { AutoApproveToggleDropdown } from "./AutoApproveToggleDropdown"
import { StandardTooltip, Popover, PopoverContent, PopoverTrigger } from "@src/components/ui"
import { useAutoApprovalState } from "@src/hooks/useAutoApprovalState"
import { useAutoApprovalToggles } from "@src/hooks/useAutoApprovalToggles"
import { cn } from "@src/lib/utils"
import { useRooPortal } from "@src/components/ui/hooks/useRooPortal"

interface AutoApproveMenuProps {
	style?: React.CSSProperties
}

const AutoApproveMenu = ({ style }: AutoApproveMenuProps) => {
	const [isExpanded, setIsExpanded] = useState(false)
	const portalContainer = useRooPortal("roo-portal")

	const {
		autoApprovalEnabled,
		setAutoApprovalEnabled,
		alwaysApproveResubmit,
		setAlwaysAllowReadOnly,
		setAlwaysAllowWrite,
		setAlwaysAllowExecute,
		setAlwaysAllowBrowser,
		setAlwaysAllowMcp,
		setAlwaysAllowModeSwitch,
		setAlwaysAllowSubtasks,
		setAlwaysApproveResubmit,
		setAlwaysAllowFollowupQuestions,
		setAlwaysAllowUpdateTodoList,
	} = useExtensionState()

	const { t } = useAppTranslation()

	const baseToggles = useAutoApprovalToggles()

	// AutoApproveMenu needs alwaysApproveResubmit in addition to the base toggles
	const toggles = useMemo(
		() => ({
			...baseToggles,
			alwaysApproveResubmit: alwaysApproveResubmit,
		}),
		[baseToggles, alwaysApproveResubmit],
	)

	const { hasEnabledOptions, effectiveAutoApprovalEnabled } = useAutoApprovalState(toggles, autoApprovalEnabled)

	const onAutoApproveToggle = useCallback(
		(key: AutoApproveSetting, value: boolean) => {
			vscode.postMessage({ type: key, bool: value })

			// Update the specific toggle state
			switch (key) {
				case "alwaysAllowReadOnly":
					setAlwaysAllowReadOnly(value)
					break
				case "alwaysAllowWrite":
					setAlwaysAllowWrite(value)
					break
				case "alwaysAllowExecute":
					setAlwaysAllowExecute(value)
					break
				case "alwaysAllowBrowser":
					setAlwaysAllowBrowser(value)
					break
				case "alwaysAllowMcp":
					setAlwaysAllowMcp(value)
					break
				case "alwaysAllowModeSwitch":
					setAlwaysAllowModeSwitch(value)
					break
				case "alwaysAllowSubtasks":
					setAlwaysAllowSubtasks(value)
					break
				case "alwaysApproveResubmit":
					setAlwaysApproveResubmit(value)
					break
				case "alwaysAllowFollowupQuestions":
					setAlwaysAllowFollowupQuestions(value)
					break
				case "alwaysAllowUpdateTodoList":
					setAlwaysAllowUpdateTodoList(value)
					break
			}

			// Check if we need to update the master auto-approval state
			// Create a new toggles state with the updated value
			const updatedToggles = {
				...toggles,
				[key]: value,
			}

			const willHaveEnabledOptions = Object.values(updatedToggles).some((v) => !!v)

			// If enabling the first option, enable master auto-approval
			if (value && !hasEnabledOptions && willHaveEnabledOptions) {
				setAutoApprovalEnabled(true)
				vscode.postMessage({ type: "autoApprovalEnabled", bool: true })
			}
			// If disabling the last option, disable master auto-approval
			else if (!value && hasEnabledOptions && !willHaveEnabledOptions) {
				setAutoApprovalEnabled(false)
				vscode.postMessage({ type: "autoApprovalEnabled", bool: false })
			}
		},
		[
			toggles,
			hasEnabledOptions,
			setAlwaysAllowReadOnly,
			setAlwaysAllowWrite,
			setAlwaysAllowExecute,
			setAlwaysAllowBrowser,
			setAlwaysAllowMcp,
			setAlwaysAllowModeSwitch,
			setAlwaysAllowSubtasks,
			setAlwaysApproveResubmit,
			setAlwaysAllowFollowupQuestions,
			setAlwaysAllowUpdateTodoList,
			setAutoApprovalEnabled,
		],
	)

	const enabledActionsList = Object.entries(toggles)
		.filter(([_key, value]) => !!value)
		.map(([key]) => t(autoApproveSettingsConfig[key as AutoApproveSetting].labelKey))
		.join(", ")

	// Update displayed text logic
	const displayText = useMemo(() => {
		if (!effectiveAutoApprovalEnabled || !hasEnabledOptions) {
			return t("chat:autoApprove.none")
		}
		return enabledActionsList || t("chat:autoApprove.none")
	}, [effectiveAutoApprovalEnabled, hasEnabledOptions, enabledActionsList, t])

	const handleOpenSettings = useCallback(
		() =>
			window.postMessage({ type: "action", action: "settingsButtonClicked", values: { section: "autoApprove" } }),
		[],
	)

	// Handler for Select All
	const handleSelectAll = useCallback(() => {
		const allSettings: AutoApproveSetting[] = Object.keys(toggles) as AutoApproveSetting[]
		allSettings.forEach((key) => {
			if (!toggles[key]) {
				onAutoApproveToggle(key, true)
			}
		})
	}, [toggles, onAutoApproveToggle])

	// Handler for Select None
	const handleSelectNone = useCallback(() => {
		const allSettings: AutoApproveSetting[] = Object.keys(toggles) as AutoApproveSetting[]
		allSettings.forEach((key) => {
			if (toggles[key]) {
				onAutoApproveToggle(key, false)
			}
		})
	}, [toggles, onAutoApproveToggle])

	const trigger = (
		<PopoverTrigger
			className={cn(
				"inline-flex items-center gap-1.5 relative whitespace-nowrap px-2 py-1 text-xs",
				"bg-transparent border border-[rgba(255,255,255,0.08)] rounded-md text-vscode-foreground",
				"transition-all duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-vscode-focusBorder focus-visible:ring-inset",
				"opacity-90 hover:opacity-100 hover:bg-[rgba(255,255,255,0.03)] hover:border-[rgba(255,255,255,0.15)] cursor-pointer",
			)}
			style={style}>
			<Stamp className="size-3.5 opacity-80 flex-shrink-0" />
			<span className="font-medium">{t("chat:autoApprove.title")}</span>
			<span className="text-vscode-descriptionForeground truncate max-w-[200px]">{displayText}</span>
		</PopoverTrigger>
	)

	return (
		<Popover open={isExpanded} onOpenChange={setIsExpanded}>
			<StandardTooltip content={t("chat:autoApprove.tooltip")}>{trigger}</StandardTooltip>

			<PopoverContent
				align="start"
				sideOffset={4}
				container={portalContainer}
				className="p-0 overflow-hidden min-w-[400px] max-w-[500px]">
				<div className="flex flex-col w-full">
					{/* Header with master toggle */}
					<div className="flex items-center justify-between p-3 border-b border-vscode-dropdown-border">
						<div className="flex items-center gap-2">
							<StandardTooltip
								content={!hasEnabledOptions ? t("chat:autoApprove.selectOptionsFirst") : undefined}>
								<VSCodeCheckbox
									checked={effectiveAutoApprovalEnabled}
									disabled={!hasEnabledOptions}
									aria-label={
										hasEnabledOptions
											? t("chat:autoApprove.toggleAriaLabel")
											: t("chat:autoApprove.disabledAriaLabel")
									}
									onChange={() => {
										if (hasEnabledOptions) {
											const newValue = !(autoApprovalEnabled ?? false)
											setAutoApprovalEnabled(newValue)
											vscode.postMessage({ type: "autoApprovalEnabled", bool: newValue })
										}
									}}
								/>
							</StandardTooltip>
							<h4 className="m-0 font-medium text-sm">{t("chat:autoApprove.title")}</h4>
						</div>
						<div className="flex items-center gap-1">
							<StandardTooltip content={t("chat:autoApprove.selectAll")}>
								<button
									onClick={handleSelectAll}
									className="p-1 rounded hover:bg-vscode-list-hoverBackground transition-colors">
									<ListChecks className="size-4" />
								</button>
							</StandardTooltip>
							<StandardTooltip content={t("chat:autoApprove.selectNone")}>
								<button
									onClick={handleSelectNone}
									className="p-1 rounded hover:bg-vscode-list-hoverBackground transition-colors">
									<LayoutList className="size-4" />
								</button>
							</StandardTooltip>
						</div>
					</div>

					{/* Description */}
					<div className="px-3 py-2 border-b border-vscode-dropdown-border">
						<div
							style={{
								color: "var(--vscode-descriptionForeground)",
								fontSize: "12px",
							}}>
							<Trans
								i18nKey="chat:autoApprove.description"
								components={{
									settingsLink: <VSCodeLink href="#" onClick={handleOpenSettings} />,
								}}
							/>
						</div>
					</div>

					{/* Two-column layout for toggles */}
					<div className="p-3 max-h-[400px] overflow-y-auto">
						<div className="grid grid-cols-2 gap-x-4">
							<AutoApproveToggleDropdown {...toggles} onToggle={onAutoApproveToggle} />
						</div>
					</div>
				</div>
			</PopoverContent>
		</Popover>
	)
}

export default memo(AutoApproveMenu)
