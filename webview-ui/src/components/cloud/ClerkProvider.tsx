import React from "react"

interface ClerkProviderProps {
	children: React.ReactNode
	userInfo?: {
		id?: string
		organizationId?: string
	} | null
}

export const ClerkProvider: React.FC<ClerkProviderProps> = ({ children }) => {
	// Since we're in a VSCode extension webview, we don't have direct access to Clerk auth
	// The authentication is handled by the backend WebAuthService
	// We'll render the OrganizationSwitcher as a UI component only

	// For now, we'll just pass through the children
	// The actual Clerk integration would require backend support
	return <>{children}</>
}

export const AccountSwitcher: React.FC<{
	organizationId?: string
	organizationName?: string
}> = ({ organizationId, organizationName }) => {
	// Since we can't directly use Clerk's OrganizationSwitcher without proper auth setup,
	// we'll create a placeholder that shows the current organization
	// In a full implementation, this would integrate with the backend auth service

	if (!organizationId || !organizationName) {
		return null
	}

	return (
		<div className="flex items-center gap-2 px-3 py-2 rounded-md border border-vscode-widget-border bg-vscode-dropdown-background">
			<span className="text-sm text-vscode-foreground">Organization:</span>
			<span className="text-sm font-medium text-vscode-foreground">{organizationName}</span>
			<span className="text-xs text-vscode-descriptionForeground ml-auto">(Switch via Roo Code Cloud)</span>
		</div>
	)
}
