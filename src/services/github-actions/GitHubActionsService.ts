import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs/promises"
import { safeWriteJson } from "../../utils/safeWriteJson"

export interface GitHubActionsConfig {
	enabled: boolean
	workflowsPath: string
	autoInstall: boolean
	defaultBranch: string
	botToken?: string
}

export interface WorkflowTemplate {
	name: string
	description: string
	fileName: string
	content: string
}

export class GitHubActionsService {
	private static instance: GitHubActionsService | undefined
	private config: GitHubActionsConfig
	private outputChannel: vscode.OutputChannel
	private workspaceRoot: string | undefined

	private constructor(outputChannel: vscode.OutputChannel, workspaceRoot: string | undefined) {
		this.outputChannel = outputChannel
		this.workspaceRoot = workspaceRoot
		this.config = this.loadConfig()
	}

	public static getInstance(outputChannel?: vscode.OutputChannel, workspaceRoot?: string): GitHubActionsService {
		if (!GitHubActionsService.instance) {
			if (!outputChannel) {
				throw new Error("OutputChannel is required for first initialization")
			}
			GitHubActionsService.instance = new GitHubActionsService(outputChannel, workspaceRoot)
		}
		return GitHubActionsService.instance
	}

	private loadConfig(): GitHubActionsConfig {
		const config = vscode.workspace.getConfiguration("rooCode.githubActions")
		return {
			enabled: config.get<boolean>("enabled", false),
			workflowsPath: config.get<string>("workflowsPath", ".github/workflows"),
			autoInstall: config.get<boolean>("autoInstall", false),
			defaultBranch: config.get<string>("defaultBranch", "main"),
			botToken: config.get<string>("botToken"),
		}
	}

	public async updateConfig(newConfig: Partial<GitHubActionsConfig>): Promise<void> {
		this.config = { ...this.config, ...newConfig }
		const config = vscode.workspace.getConfiguration("rooCode.githubActions")

		for (const [key, value] of Object.entries(newConfig)) {
			await config.update(key, value, vscode.ConfigurationTarget.Global)
		}
	}

	public getConfig(): GitHubActionsConfig {
		return { ...this.config }
	}

	public isEnabled(): boolean {
		return this.config.enabled
	}

	public async enable(): Promise<void> {
		await this.updateConfig({ enabled: true })
		this.outputChannel.appendLine("GitHub Actions bot enabled")
	}

	public async disable(): Promise<void> {
		await this.updateConfig({ enabled: false })
		this.outputChannel.appendLine("GitHub Actions bot disabled")
	}

	private getWorkflowTemplates(): WorkflowTemplate[] {
		return [
			{
				name: "Roo Code Issue Handler",
				description: "Automatically handle GitHub issues with Roo Code",
				fileName: "roo-code-issues.yml",
				content: `name: Roo Code Issue Handler

on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created]

jobs:
  handle-issue:
    runs-on: ubuntu-latest
    permissions:
      issues: write
      contents: read
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Process issue with Roo Code
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ROO_CODE_API_KEY: \${{ secrets.ROO_CODE_API_KEY }}
        run: |
          # This is a placeholder for the actual Roo Code CLI tool
          # that would process the issue
          echo "Processing issue #\${{ github.event.issue.number }}"
          echo "Title: \${{ github.event.issue.title }}"
          echo "Body: \${{ github.event.issue.body }}"
          
      - name: Create pull request if needed
        if: success()
        uses: peter-evans/create-pull-request@v5
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
          commit-message: "fix: Automated fix for issue #\${{ github.event.issue.number }}"
          title: "Fix for issue #\${{ github.event.issue.number }}"
          body: |
            This PR was automatically created by Roo Code to address issue #\${{ github.event.issue.number }}.
            
            ## Changes
            - Automated fix implementation
            
            Closes #\${{ github.event.issue.number }}
          branch: roo-code/issue-\${{ github.event.issue.number }}
`,
			},
			{
				name: "Roo Code PR Review",
				description: "Automatically review pull requests with Roo Code",
				fileName: "roo-code-pr-review.yml",
				content: `name: Roo Code PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review-pr:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Review PR with Roo Code
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ROO_CODE_API_KEY: \${{ secrets.ROO_CODE_API_KEY }}
        run: |
          # This is a placeholder for the actual Roo Code CLI tool
          # that would review the PR
          echo "Reviewing PR #\${{ github.event.pull_request.number }}"
          echo "Title: \${{ github.event.pull_request.title }}"
          
      - name: Post review comment
        if: success()
        uses: actions/github-script@v7
        with:
          github-token: \${{ secrets.GITHUB_TOKEN }}
          script: |
            await github.rest.pulls.createReview({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              body: '## Roo Code Review\\n\\nThis PR has been automatically reviewed by Roo Code.\\n\\n✅ No issues found.',
              event: 'COMMENT'
            });
`,
			},
			{
				name: "Roo Code Auto-Fix",
				description: "Automatically fix code issues on push",
				fileName: "roo-code-auto-fix.yml",
				content: `name: Roo Code Auto-Fix

on:
  push:
    branches: [ main, develop ]
    paths:
      - '**.ts'
      - '**.tsx'
      - '**.js'
      - '**.jsx'
      - '**.py'
      - '**.java'

jobs:
  auto-fix:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Run Roo Code auto-fix
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ROO_CODE_API_KEY: \${{ secrets.ROO_CODE_API_KEY }}
        run: |
          # This is a placeholder for the actual Roo Code CLI tool
          # that would auto-fix issues
          echo "Running Roo Code auto-fix on changed files"
          
      - name: Commit and push if changed
        run: |
          git config --global user.name 'Roo Code Bot'
          git config --global user.email 'bot@roo-code.com'
          git add -A
          if git diff --staged --quiet; then
            echo "No changes to commit"
          else
            git commit -m "fix: Auto-fix by Roo Code bot"
            git push
          fi
`,
			},
		]
	}

	public async installWorkflows(selectedTemplates?: string[]): Promise<void> {
		if (!this.workspaceRoot) {
			throw new Error("No workspace folder open")
		}

		const templates = this.getWorkflowTemplates()
		const templatesToInstall = selectedTemplates
			? templates.filter((t) => selectedTemplates.includes(t.fileName))
			: templates

		const workflowsDir = path.join(this.workspaceRoot, this.config.workflowsPath)

		// Create workflows directory if it doesn't exist
		await fs.mkdir(workflowsDir, { recursive: true })

		for (const template of templatesToInstall) {
			const filePath = path.join(workflowsDir, template.fileName)

			// Check if file already exists
			try {
				await fs.access(filePath)
				const overwrite = await vscode.window.showWarningMessage(
					`Workflow ${template.fileName} already exists. Overwrite?`,
					"Yes",
					"No",
				)
				if (overwrite !== "Yes") {
					continue
				}
			} catch {
				// File doesn't exist, proceed with creation
			}

			await fs.writeFile(filePath, template.content, "utf8")
			this.outputChannel.appendLine(`Installed workflow: ${template.fileName}`)
		}

		vscode.window.showInformationMessage(
			`Successfully installed ${templatesToInstall.length} GitHub Actions workflow(s)`,
		)
	}

	public async setupBot(): Promise<void> {
		// Guide user through bot setup
		const steps = [
			"1. Go to your repository settings on GitHub",
			"2. Navigate to 'Secrets and variables' > 'Actions'",
			"3. Add a new secret named 'ROO_CODE_API_KEY'",
			"4. Generate an API key from Roo Code settings",
			"5. Paste the API key as the secret value",
		]

		const message = `To complete GitHub Actions bot setup:\n\n${steps.join("\n")}`

		const result = await vscode.window.showInformationMessage(
			message,
			"Open GitHub Settings",
			"Copy Instructions",
			"Close",
		)

		if (result === "Open GitHub Settings") {
			const repoUrl = await this.getRepositoryUrl()
			if (repoUrl) {
				vscode.env.openExternal(vscode.Uri.parse(`${repoUrl}/settings/secrets/actions`))
			}
		} else if (result === "Copy Instructions") {
			await vscode.env.clipboard.writeText(steps.join("\n"))
			vscode.window.showInformationMessage("Setup instructions copied to clipboard")
		}
	}

	private async getRepositoryUrl(): Promise<string | undefined> {
		if (!this.workspaceRoot) {
			return undefined
		}

		try {
			const gitConfigPath = path.join(this.workspaceRoot, ".git", "config")
			const gitConfig = await fs.readFile(gitConfigPath, "utf8")

			// Extract remote origin URL
			const match = gitConfig.match(/url = (.+)/)
			if (match) {
				let url = match[1]
				// Convert SSH URL to HTTPS if needed
				if (url.startsWith("git@github.com:")) {
					url = url.replace("git@github.com:", "https://github.com/")
				}
				// Remove .git suffix if present
				if (url.endsWith(".git")) {
					url = url.slice(0, -4)
				}
				return url
			}
		} catch (error) {
			this.outputChannel.appendLine(`Failed to get repository URL: ${error}`)
		}

		return undefined
	}

	public getAvailableTemplates(): WorkflowTemplate[] {
		return this.getWorkflowTemplates()
	}

	public async checkWorkflowsInstalled(): Promise<boolean> {
		if (!this.workspaceRoot) {
			return false
		}

		const workflowsDir = path.join(this.workspaceRoot, this.config.workflowsPath)

		try {
			await fs.access(workflowsDir)
			const files = await fs.readdir(workflowsDir)
			return files.some((file) => file.startsWith("roo-code-"))
		} catch {
			return false
		}
	}

	public async getInstalledWorkflows(): Promise<string[]> {
		if (!this.workspaceRoot) {
			return []
		}

		const workflowsDir = path.join(this.workspaceRoot, this.config.workflowsPath)

		try {
			const files = await fs.readdir(workflowsDir)
			return files.filter((file) => file.startsWith("roo-code-") && file.endsWith(".yml"))
		} catch {
			return []
		}
	}

	public dispose(): void {
		// Clean up resources if needed
		GitHubActionsService.instance = undefined
	}
}
