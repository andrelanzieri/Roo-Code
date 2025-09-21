import React, { useState, useEffect } from "react"
import { VSCodeButton, VSCodeCheckbox, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import { vscode } from "../../utils/vscode"

interface WorkflowTemplate {
	name: string
	description: string
	filename: string
	installed?: boolean
}

interface GitHubActionsConfig {
	enabled: boolean
	workflowsPath: string
	autoInstall: boolean
	defaultBranch: string
	modelProvider?: string
	modelName?: string
}

export default function GitHubActionsView({ onDone }: { onDone: () => void }) {
	const [config, setConfig] = useState<GitHubActionsConfig>({
		enabled: false,
		workflowsPath: ".github/workflows",
		autoInstall: false,
		defaultBranch: "main",
		modelProvider: "anthropic",
		modelName: "claude-3-5-sonnet-20241022",
	})
	const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([
		{
			name: "RooCode Agent Bot",
			description: "Main bot workflow that handles issues and PRs with /roo commands",
			filename: "roocode-bot.yml",
			installed: false,
		},
		{
			name: "Issue Triage",
			description: "Automatically triage and label new issues",
			filename: "issue-triage.yml",
			installed: false,
		},
		{
			name: "PR Auto-Review",
			description: "Automatically review pull requests",
			filename: "pr-auto-review.yml",
			installed: false,
		},
		{
			name: "Auto-Fix",
			description: "Automatically fix simple issues on push",
			filename: "auto-fix.yml",
			installed: false,
		},
	])
	const [showSetupGuide, setShowSetupGuide] = useState(false)

	useEffect(() => {
		// Load configuration from extension
		vscode.postMessage({ type: "getGitHubActionsConfig" })
		vscode.postMessage({ type: "getInstalledWorkflows" })
	}, [])

	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			const message = event.data
			switch (message.type) {
				case "gitHubActionsConfig":
					setConfig(message.config)
					break
				case "installedWorkflows": {
					const installedFiles = message.workflows || []
					setWorkflows((prev) =>
						prev.map((w) => ({
							...w,
							installed: installedFiles.includes(w.filename),
						})),
					)
					break
				}
				case "workflowInstalled":
					setWorkflows((prev) =>
						prev.map((w) => (w.filename === message.filename ? { ...w, installed: true } : w)),
					)
					break
				case "workflowUninstalled":
					setWorkflows((prev) =>
						prev.map((w) => (w.filename === message.filename ? { ...w, installed: false } : w)),
					)
					break
			}
		}

		window.addEventListener("message", handleMessage)
		return () => window.removeEventListener("message", handleMessage)
	}, [])

	const handleToggleBot = () => {
		const newConfig = { ...config, enabled: !config.enabled }
		setConfig(newConfig)
		vscode.postMessage({ type: "updateGitHubActionsConfig", config: newConfig })
	}

	const handleInstallWorkflow = (workflow: WorkflowTemplate) => {
		vscode.postMessage({ type: "installGitHubActionsWorkflow", workflow })
	}

	const handleUninstallWorkflow = (workflow: WorkflowTemplate) => {
		vscode.postMessage({ type: "uninstallGitHubActionsWorkflow", filename: workflow.filename })
	}

	const handleSetupRepository = () => {
		vscode.postMessage({ type: "setupGitHubRepository" })
		setShowSetupGuide(true)
	}

	const handleTestConnection = () => {
		vscode.postMessage({ type: "testGitHubActionsConnection" })
	}

	return (
		<div className="github-actions-view" style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
			<div className="header" style={{ marginBottom: "20px" }}>
				<h2 style={{ fontSize: "24px", marginBottom: "10px" }}>🤖 GitHub Actions Bot</h2>
				<p style={{ color: "var(--vscode-descriptionForeground)" }}>
					Automate issue and pull request handling with AI-powered GitHub Actions
				</p>
			</div>

			<VSCodeDivider />

			<div className="bot-status" style={{ margin: "20px 0" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
					<VSCodeCheckbox checked={config.enabled} onChange={handleToggleBot}>
						Enable GitHub Actions Bot
					</VSCodeCheckbox>
					<span
						style={{
							padding: "2px 8px",
							borderRadius: "4px",
							fontSize: "12px",
							backgroundColor: config.enabled
								? "var(--vscode-testing-iconPassed)"
								: "var(--vscode-testing-iconFailed)",
							color: "var(--vscode-editor-background)",
						}}>
						{config.enabled ? "Active" : "Inactive"}
					</span>
				</div>

				<div style={{ display: "flex", gap: "10px" }}>
					<VSCodeButton onClick={handleSetupRepository}>📚 Setup Guide</VSCodeButton>
					<VSCodeButton onClick={handleTestConnection} appearance="secondary">
						🔌 Test Connection
					</VSCodeButton>
				</div>
			</div>

			<VSCodeDivider />

			<div className="workflows" style={{ margin: "20px 0" }}>
				<h3 style={{ fontSize: "18px", marginBottom: "15px" }}>Available Workflows</h3>
				<div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
					{workflows.map((workflow) => (
						<div
							key={workflow.filename}
							style={{
								padding: "15px",
								border: "1px solid var(--vscode-panel-border)",
								borderRadius: "4px",
								backgroundColor: "var(--vscode-editor-background)",
							}}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
								<div style={{ flex: 1 }}>
									<h4 style={{ fontSize: "16px", marginBottom: "5px" }}>
										{workflow.name}
										{workflow.installed && (
											<span
												style={{
													marginLeft: "10px",
													padding: "2px 6px",
													borderRadius: "3px",
													fontSize: "11px",
													backgroundColor: "var(--vscode-testing-iconPassed)",
													color: "var(--vscode-editor-background)",
												}}>
												Installed
											</span>
										)}
									</h4>
									<p style={{ fontSize: "13px", color: "var(--vscode-descriptionForeground)" }}>
										{workflow.description}
									</p>
									<code style={{ fontSize: "11px", color: "var(--vscode-textPreformat-foreground)" }}>
										{workflow.filename}
									</code>
								</div>
								<VSCodeButton
									onClick={() =>
										workflow.installed
											? handleUninstallWorkflow(workflow)
											: handleInstallWorkflow(workflow)
									}
									appearance={workflow.installed ? "secondary" : "primary"}>
									{workflow.installed ? "Uninstall" : "Install"}
								</VSCodeButton>
							</div>
						</div>
					))}
				</div>
			</div>

			{showSetupGuide && (
				<>
					<VSCodeDivider />
					<div className="setup-guide" style={{ margin: "20px 0" }}>
						<h3 style={{ fontSize: "18px", marginBottom: "15px" }}>📋 Setup Instructions</h3>
						<div
							style={{
								padding: "15px",
								backgroundColor: "var(--vscode-textBlockQuote-background)",
								borderRadius: "4px",
								fontSize: "13px",
								lineHeight: "1.6",
							}}>
							<ol style={{ marginLeft: "20px" }}>
								<li>
									<strong>Configure Repository Secrets:</strong>
									<ul style={{ marginTop: "5px" }}>
										<li>Go to your repository&apos;s Settings → Secrets and variables → Actions</li>
										<li>
											Add <code>ANTHROPIC_API_KEY</code> or <code>OPENAI_API_KEY</code>
										</li>
										<li>
											Optionally add <code>OPENROUTER_API_KEY</code> for OpenRouter support
										</li>
									</ul>
								</li>
								<li style={{ marginTop: "10px" }}>
									<strong>Configure Repository Variables:</strong>
									<ul style={{ marginTop: "5px" }}>
										<li>
											<code>MODEL_PROVIDER</code>: anthropic, openai, or openrouter
										</li>
										<li>
											<code>MODEL_NAME</code>: Model identifier (e.g., claude-3-5-sonnet-20241022)
										</li>
										<li>
											<code>MAX_TOKENS</code>: Maximum response tokens (default: 8192)
										</li>
										<li>
											<code>TEMPERATURE</code>: Model temperature 0-1 (default: 0.2)
										</li>
									</ul>
								</li>
								<li style={{ marginTop: "10px" }}>
									<strong>Enable GitHub Actions Permissions:</strong>
									<ul style={{ marginTop: "5px" }}>
										<li>Go to Settings → Actions → General</li>
										<li>Select &quot;Read and write permissions&quot;</li>
										<li>
											Check &quot;Allow GitHub Actions to create and approve pull requests&quot;
										</li>
									</ul>
								</li>
								<li style={{ marginTop: "10px" }}>
									<strong>Install Workflows:</strong>
									<ul style={{ marginTop: "5px" }}>
										<li>Click &quot;Install&quot; on the workflows you want to use</li>
										<li>Commit and push the changes to your repository</li>
									</ul>
								</li>
								<li style={{ marginTop: "10px" }}>
									<strong>Test the Bot:</strong>
									<ul style={{ marginTop: "5px" }}>
										<li>
											Create an issue or comment with <code>/roo</code> command
										</li>
										<li>
											Example: <code>/roo plan</code> to create an implementation plan
										</li>
									</ul>
								</li>
							</ol>
						</div>
					</div>
				</>
			)}

			<VSCodeDivider />

			<div className="commands-reference" style={{ margin: "20px 0" }}>
				<h3 style={{ fontSize: "18px", marginBottom: "15px" }}>🎯 Available Commands</h3>
				<div
					style={{
						padding: "15px",
						backgroundColor: "var(--vscode-editor-background)",
						borderRadius: "4px",
						fontSize: "13px",
					}}>
					<div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 20px" }}>
						<code>/roo plan</code>
						<span>Create a detailed implementation plan for an issue</span>

						<code>/roo approve</code>
						<span>Approve a plan and start implementation</span>

						<code>/roo fix</code>
						<span>Directly implement a fix for an issue</span>

						<code>/roo review</code>
						<span>Perform a code review on a pull request</span>

						<code>/roo triage</code>
						<span>Analyze and triage an issue (priority, labels, complexity)</span>

						<code>/roo label</code>
						<span>Automatically add appropriate labels to an issue</span>

						<code>/roo</code>
						<span>General interaction with the bot</span>
					</div>
				</div>
			</div>

			<VSCodeDivider />

			<div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
				<VSCodeButton onClick={onDone}>Done</VSCodeButton>
			</div>
		</div>
	)
}
