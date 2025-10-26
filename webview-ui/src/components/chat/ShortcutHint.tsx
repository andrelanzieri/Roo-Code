import React from "react"
import { Trans } from "react-i18next"

import { useAppTranslation } from "@/i18n/TranslationContext"
import { usePlatform } from "@/hooks/usePlatform"

interface ShortcutHintProps {
	translationKey: string
}

export const ShortcutHint: React.FC<ShortcutHintProps> = ({ translationKey }) => {
	const { t } = useAppTranslation()
	const platform = usePlatform()

	const getShortcut = () => {
		switch (platform) {
			case "mac":
				return "⌘⌥A"
			case "windows":
			case "linux":
				return "Ctrl+Alt+A"
			default:
				return ""
		}
	}

	const shortcut = getShortcut()

	if (!shortcut) {
		return null
	}

	return (
		<p className="m-0 text-xs text-vscode-descriptionForeground">
			<Trans
				i18nKey={translationKey}
				components={{
					shortcut: <code className="p-1 rounded bg-vscode-button-background">{shortcut}</code>,
				}}
			/>
		</p>
	)
}
