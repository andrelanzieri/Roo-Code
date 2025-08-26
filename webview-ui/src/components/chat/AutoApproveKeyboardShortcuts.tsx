import { useEffect, useCallback, useMemo } from "react"
import { useExtensionState } from "@src/context/ExtensionStateContext"
import { vscode } from "@src/utils/vscode"
import { AutoApproveSetting } from "../settings/AutoApproveToggle"
import { useAutoApprovalToggles } from "@src/hooks/useAutoApprovalToggles"

// Keyboard shortcuts mapping for auto-approve options
const KEYBOARD_SHORTCUTS: Record<string, AutoApproveSetting> = {
	"1": "alwaysAllowReadOnly",
	"2": "alwaysAllowWrite",
	"3": "alwaysAllowBrowser",
	"4": "alwaysAllowExecute",
	"5": "alwaysAllowMcp",
	"6": "alwaysAllowModeSwitch",
	"7": "alwaysAllowSubtasks",
	"8": "alwaysAllowFollowupQuestions",
	"9": "alwaysAllowUpdateTodoList",
	"0": "alwaysApproveResubmit",
}

export const AutoApproveKeyboardShortcuts = () => {
	const {
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
		alwaysApproveResubmit,
	} = useExtensionState()

	const baseToggles = useAutoApprovalToggles()
	const toggles = useMemo(
		() => ({
			...baseToggles,
			alwaysApproveResubmit,
		}),
		[baseToggles, alwaysApproveResubmit],
	)

	const handleToggle = useCallback(
		(key: AutoApproveSetting) => {
			const currentValue = toggles[key]
			const newValue = !currentValue

			// Send message to extension
			vscode.postMessage({ type: key, bool: newValue })

			// Update local state
			switch (key) {
				case "alwaysAllowReadOnly":
					setAlwaysAllowReadOnly(newValue)
					break
				case "alwaysAllowWrite":
					setAlwaysAllowWrite(newValue)
					break
				case "alwaysAllowExecute":
					setAlwaysAllowExecute(newValue)
					break
				case "alwaysAllowBrowser":
					setAlwaysAllowBrowser(newValue)
					break
				case "alwaysAllowMcp":
					setAlwaysAllowMcp(newValue)
					break
				case "alwaysAllowModeSwitch":
					setAlwaysAllowModeSwitch(newValue)
					break
				case "alwaysAllowSubtasks":
					setAlwaysAllowSubtasks(newValue)
					break
				case "alwaysApproveResubmit":
					setAlwaysApproveResubmit(newValue)
					break
				case "alwaysAllowFollowupQuestions":
					setAlwaysAllowFollowupQuestions(newValue)
					break
				case "alwaysAllowUpdateTodoList":
					setAlwaysAllowUpdateTodoList(newValue)
					break
			}
		},
		[
			toggles,
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
		],
	)

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			// Check if Alt/Option key is pressed along with a number key
			if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
				const shortcut = KEYBOARD_SHORTCUTS[event.key]
				if (shortcut) {
					event.preventDefault()
					handleToggle(shortcut)
				}
			}
		}

		window.addEventListener("keydown", handleKeyDown)
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
		}
	}, [handleToggle])

	return null // This component doesn't render anything
}
