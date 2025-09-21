import React, { useState, useEffect } from "react"
import { VSCodeCheckbox, VSCodeDivider } from "@vscode/webview-ui-toolkit/react"
import { Github, Check, X, AlertCircle } from "lucide-react"
import { vscode } from "@src/utils/vscode"
import { Button } from "@src/components/ui"

interface GitHubActionsViewProps {
	onDone: () => void
}

interface WorkflowTemplate {
	name: string
	description: string
	fileName: string
	selected: boolean
}

const GitHubActionsView: React.FC<GitHubActionsViewProps> = ({ onDone }) => {
	const [isEnabled, setIsEnabled] = useState(false)
	const [workflowsInstalled, setWorkflowsInstalled] = useState(false)
	const [templates, setTemplates] = useState<WorkflowTemplate[]>([
		{
			name: "Roo Code Issue Handler",
			description: "Automatically handle GitHub issues with Roo Code",
			fileName: "roo-code-issues.yml",
			selected: true,
		},
		{
			name: "Roo Code PR Review",
			description: "Automatically review pull requests with Roo Code",
			fileName: "roo-code-pr-review.yml",
			selected: true,
		},
		{
			name: "Roo Code Auto-Fix",
			description: "Automatically fix code issues on push",
			fileName: "roo-code-auto-fix.yml",
			selected: false,
		},
	])
	const [installing, setInstalling] = useState(false)
	const [setupComplete, setSetupComplete] = useState(false)

	useEffect(() => {
		// Check if GitHub Actions is enabled
		vscode.postMessage({ type: "githubActionsStatus" })
	}, [])

	const handleEnable = () => {
		setIsEnabled(true)
		vscode.postMessage({ type: "githubActionsEnable" })
	}

	const handleDisable = () => {
		setIsEnabled(false)
		vscode.postMessage({ type: "githubActionsDisable" })
	}

	const handleTemplateToggle = (index: number) => {
		const newTemplates = [...templates]
		newTemplates[index].selected = !newTemplates[index].selected
		setTemplates(newTemplates)
	}

	const handleInstallWorkflows = async () => {
		setInstalling(true)
		const selectedTemplates = templates.filter((t) => t.selected).map((t) => t.fileName)
		vscode.postMessage({
			type: "githubActionsInstallWorkflows",
			templates: selectedTemplates,
		})

		// Simulate installation delay
		setTimeout(() => {
			setInstalling(false)
			setWorkflowsInstalled(true)
		}, 2000)
	}

	const handleSetupBot = () => {
		vscode.postMessage({ type: "githubActionsSetupBot" })
		setSetupComplete(true)
	}

	return (
		<div className="flex flex-col h-full">
			{/* Header */}
			<div className="flex items-center justify-between p-4 border-b border-vscode-panel-border">
				<div className="flex items-center gap-2">
					<Github className="w-5 h-5" />
					<h2 className="text-lg font-semibold">GitHub Actions Bot</h2>
				</div>
				<Button variant="ghost" size="sm" onClick={onDone}>
					<X className="w-4 h-4" />
				</Button>
			</div>

			{/* Content */}
			<div className="flex-1 overflow-y-auto p-4">
				<div className="space-y-6">
					{/* Enable/Disable Section */}
					<div className="space-y-3">
						<h3 className="text-base font-medium">Bot Status</h3>
						<div className="flex items-center gap-3">
							<div
								className={`flex items-center gap-2 px-3 py-1 rounded-md ${
									isEnabled
										? "bg-green-500/10 text-green-500 border border-green-500/20"
										: "bg-vscode-input-background text-vscode-descriptionForeground border border-vscode-panel-border"
								}`}>
								{isEnabled ? (
									<>
										<Check className="w-4 h-4" />
										<span>Enabled</span>
									</>
								) : (
									<>
										<X className="w-4 h-4" />
										<span>Disabled</span>
									</>
								)}
							</div>
							{isEnabled ? (
								<Button variant="secondary" size="sm" onClick={handleDisable}>
									Disable Bot
								</Button>
							) : (
								<Button variant="default" size="sm" onClick={handleEnable}>
									Enable Bot
								</Button>
							)}
						</div>
					</div>

					<VSCodeDivider />

					{/* Workflow Templates Section */}
					<div className="space-y-3">
						<h3 className="text-base font-medium">Workflow Templates</h3>
						<p className="text-sm text-vscode-descriptionForeground">
							Select the GitHub Actions workflows you want to install:
						</p>

						<div className="space-y-2">
							{templates.map((template, index) => (
								<div
									key={template.fileName}
									className="flex items-start gap-3 p-3 rounded-md bg-vscode-input-background border border-vscode-panel-border">
									<VSCodeCheckbox
										checked={template.selected}
										onChange={() => handleTemplateToggle(index)}
									/>
									<div className="flex-1">
										<div className="font-medium">{template.name}</div>
										<div className="text-sm text-vscode-descriptionForeground mt-1">
											{template.description}
										</div>
										<div className="text-xs text-vscode-descriptionForeground mt-1 font-mono">
											{template.fileName}
										</div>
									</div>
								</div>
							))}
						</div>

						<div className="flex gap-2">
							<Button
								variant="default"
								onClick={handleInstallWorkflows}
								disabled={installing || !templates.some((t) => t.selected)}>
								{installing ? "Installing..." : "Install Selected Workflows"}
							</Button>
							{workflowsInstalled && (
								<div className="flex items-center gap-2 text-green-500">
									<Check className="w-4 h-4" />
									<span className="text-sm">Workflows installed successfully!</span>
								</div>
							)}
						</div>
					</div>

					<VSCodeDivider />

					{/* Setup Instructions Section */}
					<div className="space-y-3">
						<h3 className="text-base font-medium">Setup Instructions</h3>

						<div className="space-y-3 p-4 rounded-md bg-vscode-input-background border border-vscode-panel-border">
							<div className="flex items-start gap-2">
								<AlertCircle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
								<div className="text-sm">
									<p className="font-medium mb-2">To complete the setup:</p>
									<ol className="list-decimal list-inside space-y-1 text-vscode-descriptionForeground">
										<li>Go to your repository settings on GitHub</li>
										<li>Navigate to &quot;Secrets and variables&quot; → &quot;Actions&quot;</li>
										<li>
											Add a new secret named{" "}
											<code className="px-1 py-0.5 bg-vscode-editor-background rounded">
												ROO_CODE_API_KEY
											</code>
										</li>
										<li>Generate an API key from Roo Code settings</li>
										<li>Paste the API key as the secret value</li>
									</ol>
								</div>
							</div>
						</div>

						<div className="flex gap-2">
							<Button variant="default" onClick={handleSetupBot}>
								Open Setup Guide
							</Button>
							{setupComplete && (
								<div className="flex items-center gap-2 text-green-500">
									<Check className="w-4 h-4" />
									<span className="text-sm">Setup guide opened!</span>
								</div>
							)}
						</div>
					</div>

					{/* Status Section */}
					{isEnabled && workflowsInstalled && (
						<>
							<VSCodeDivider />
							<div className="space-y-3">
								<h3 className="text-base font-medium">Bot Status</h3>
								<div className="p-4 rounded-md bg-green-500/10 border border-green-500/20">
									<div className="flex items-center gap-2 text-green-500">
										<Check className="w-5 h-5" />
										<span className="font-medium">GitHub Actions Bot is Active</span>
									</div>
									<p className="text-sm text-vscode-descriptionForeground mt-2">
										The bot will automatically process issues and pull requests based on your
										installed workflows.
									</p>
								</div>
							</div>
						</>
					)}
				</div>
			</div>

			{/* Footer */}
			<div className="p-4 border-t border-vscode-panel-border">
				<div className="flex justify-between items-center">
					<div className="text-xs text-vscode-descriptionForeground">
						GitHub Actions integration for automated issue and PR handling
					</div>
					<Button variant="secondary" onClick={onDone}>
						Close
					</Button>
				</div>
			</div>
		</div>
	)
}

export default GitHubActionsView
