import React, { Component } from "react"
import { telemetryClient } from "@src/utils/TelemetryClient"
import { withTranslation, WithTranslation } from "react-i18next"
import { enhanceErrorWithSourceMaps } from "@src/utils/sourceMapUtils"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

type ErrorProps = {
	children: React.ReactNode
} & WithTranslation

type ErrorState = {
	error?: string
	componentStack?: string | null
	timestamp?: number
	hasError: boolean
	errorCount: number
}

class ErrorBoundary extends Component<ErrorProps, ErrorState> {
	private retryTimeoutId: NodeJS.Timeout | null = null

	constructor(props: ErrorProps) {
		super(props)
		this.state = {
			hasError: false,
			errorCount: 0,
		}
	}

	static getDerivedStateFromError(error: unknown) {
		let errorMessage = ""

		if (error instanceof Error) {
			errorMessage = error.stack ?? error.message
		} else {
			errorMessage = `${error}`
		}

		return {
			error: errorMessage,
			timestamp: Date.now(),
			hasError: true,
		}
	}

	async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		const componentStack = errorInfo.componentStack || ""
		const enhancedError = await enhanceErrorWithSourceMaps(error, componentStack)

		// Increment error count
		this.setState((prevState) => ({
			errorCount: prevState.errorCount + 1,
		}))

		telemetryClient.capture("error_boundary_caught_error", {
			error: enhancedError.message,
			stack: enhancedError.sourceMappedStack || enhancedError.stack,
			componentStack: enhancedError.sourceMappedComponentStack || componentStack,
			timestamp: Date.now(),
			errorType: enhancedError.name,
			errorCount: this.state.errorCount + 1,
		})

		this.setState({
			error: enhancedError.sourceMappedStack || enhancedError.stack,
			componentStack: enhancedError.sourceMappedComponentStack || componentStack,
		})

		// Auto-retry after 5 seconds if this is the first error
		if (this.state.errorCount === 0 && !this.retryTimeoutId) {
			this.retryTimeoutId = setTimeout(() => {
				this.handleReset()
			}, 5000)
		}
	}

	componentWillUnmount() {
		if (this.retryTimeoutId) {
			clearTimeout(this.retryTimeoutId)
			this.retryTimeoutId = null
		}
	}

	handleReset = () => {
		if (this.retryTimeoutId) {
			clearTimeout(this.retryTimeoutId)
			this.retryTimeoutId = null
		}

		this.setState({
			error: undefined,
			componentStack: undefined,
			timestamp: undefined,
			hasError: false,
			// Don't reset errorCount to track total errors in session
		})
	}

	handleReload = () => {
		window.location.reload()
	}

	render() {
		const { t } = this.props

		if (!this.state.hasError || !this.state.error) {
			return this.props.children
		}

		const errorDisplay = this.state.error
		const componentStackDisplay = this.state.componentStack

		const version = process.env.PKG_VERSION || "unknown"

		// Use a white background to ensure visibility and prevent gray screen
		return (
			<div
				className="fixed inset-0 bg-vscode-editor-background overflow-auto p-4"
				style={{ backgroundColor: "var(--vscode-editor-background, white)", zIndex: 9999 }}>
				<div className="max-w-4xl mx-auto">
					<h2 className="text-lg font-bold mt-0 mb-2 text-vscode-editor-foreground">
						{t("errorBoundary.title")} (v{version})
					</h2>

					{this.state.errorCount === 1 && (
						<div className="mb-4 p-3 bg-vscode-notifications-background border border-vscode-notifications-border rounded">
							<p className="text-vscode-notifications-foreground">
								The application will attempt to recover automatically in a few seconds...
							</p>
						</div>
					)}

					<div className="flex gap-2 mb-4">
						<VSCodeButton appearance="primary" onClick={this.handleReset}>
							Try Again
						</VSCodeButton>
						<VSCodeButton appearance="secondary" onClick={this.handleReload}>
							Reload Window
						</VSCodeButton>
					</div>

					<p className="mb-4 text-vscode-editor-foreground">
						{t("errorBoundary.reportText")}{" "}
						<a
							href="https://github.com/RooCodeInc/Roo-Code/issues"
							target="_blank"
							rel="noreferrer"
							className="text-vscode-textLink-foreground hover:text-vscode-textLink-activeForeground">
							{t("errorBoundary.githubText")}
						</a>
					</p>
					<p className="mb-2 text-vscode-editor-foreground">{t("errorBoundary.copyInstructions")}</p>

					<details className="mb-4">
						<summary className="cursor-pointer text-vscode-editor-foreground font-bold mb-2">
							{t("errorBoundary.errorStack")} (Click to expand)
						</summary>
						<pre className="p-2 border border-vscode-panel-border rounded text-sm overflow-auto bg-vscode-editor-background text-vscode-editor-foreground mt-2">
							{errorDisplay}
						</pre>
					</details>

					{componentStackDisplay && (
						<details>
							<summary className="cursor-pointer text-vscode-editor-foreground font-bold mb-2">
								{t("errorBoundary.componentStack")} (Click to expand)
							</summary>
							<pre className="p-2 border border-vscode-panel-border rounded text-sm overflow-auto bg-vscode-editor-background text-vscode-editor-foreground mt-2">
								{componentStackDisplay}
							</pre>
						</details>
					)}
				</div>
			</div>
		)
	}
}

export default withTranslation("common")(ErrorBoundary)
