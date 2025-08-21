import React from "react"
import { useTranslation } from "react-i18next"
import { Package } from "@roo/package"

interface VersionIndicatorProps {
	onClick: () => void
	className?: string
	showNotification?: boolean
}

const VersionIndicator: React.FC<VersionIndicatorProps> = ({ onClick, className = "", showNotification = false }) => {
	const { t } = useTranslation()

	return (
		<button
			onClick={onClick}
			className={`relative text-xs text-vscode-descriptionForeground hover:text-vscode-foreground transition-colors cursor-pointer px-2 py-1 rounded border ${className}`}
			aria-label={t("chat:versionIndicator.ariaLabel", { version: Package.version })}>
			v{Package.version}
			{showNotification && (
				<span
					className="absolute -top-1 -right-1 w-2 h-2 bg-vscode-badge-background rounded-full animate-pulse"
					aria-label={t("chat:versionIndicator.newAnnouncement")}
				/>
			)}
		</button>
	)
}

export default VersionIndicator
