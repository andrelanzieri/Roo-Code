import * as vscode from "vscode"
import * as fs from "fs/promises"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export interface GitHubActionsConfig {
	enabled: boolean
	workflowsPath: string
	autoInstall: boolean
	defaultBranch: string
	botToken?: string
	modelProvider?: string
	modelName?: string
}

export interface WorkflowTemplate {
	name: string
	description: string
	filename: string
	content: string
}

export class GitHubActionsService {
	private static instance: GitHubActionsService
	private config: GitHubActionsConfig
	private workspaceRoot: string | undefined

	private constructor() {
		this.config = this.loadConfig()
		this.workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
	}

	public static getInstance(): GitHubActionsService {
		if (!GitHubActionsService.instance) {
			GitHubActionsService.instance = new GitHubActionsService()
		}
		return GitHubActionsService.instance
	}

	private loadConfig(): GitHubActionsConfig {
		const config = vscode.workspace.getConfiguration("roo-cline.githubActions")
		return {
			enabled: config.get<boolean>("enabled", false),
			workflowsPath: config.get<string>("workflowsPath", ".github/workflows"),
			autoInstall: config.get<boolean>("autoInstall", false),
			defaultBranch: config.get<string>("defaultBranch", "main"),
			botToken: config.get<string>("botToken"),
			modelProvider: config.get<string>("modelProvider", "anthropic"),
			modelName: config.get<string>("modelName", "claude-3-5-sonnet-20241022"),
		}
	}

	public async updateConfig(newConfig: Partial<GitHubActionsConfig>): Promise<void> {
		const config = vscode.workspace.getConfiguration("roo-cline.githubActions")

		for (const [key, value] of Object.entries(newConfig)) {
			await config.update(key, value, vscode.ConfigurationTarget.Workspace)
		}

		this.config = { ...this.config, ...newConfig }
	}

	public getConfig(): GitHubActionsConfig {
		return this.config
	}

	public getWorkflowTemplates(): WorkflowTemplate[] {
		return [
			{
				name: "RooCode Agent Bot",
				description: "Main bot workflow that handles issues and PRs with /roo commands",
				filename: "roocode-bot.yml",
				content: this.getRooCodeBotWorkflow(),
			},
			{
				name: "Issue Triage",
				description: "Automatically triage and label new issues",
				filename: "issue-triage.yml",
				content: this.getIssueTriageWorkflow(),
			},
			{
				name: "PR Auto-Review",
				description: "Automatically review pull requests",
				filename: "pr-auto-review.yml",
				content: this.getPRAutoReviewWorkflow(),
			},
			{
				name: "Auto-Fix",
				description: "Automatically fix simple issues on push",
				filename: "auto-fix.yml",
				content: this.getAutoFixWorkflow(),
			},
		]
	}

	public async installWorkflow(template: WorkflowTemplate): Promise<void> {
		if (!this.workspaceRoot) {
			throw new Error("No workspace folder found")
		}

		const workflowsDir = path.join(this.workspaceRoot, this.config.workflowsPath)
		const workflowPath = path.join(workflowsDir, template.filename)

		// Create workflows directory if it doesn't exist
		await fs.mkdir(workflowsDir, { recursive: true })

		// Write workflow file
		await fs.writeFile(workflowPath, template.content, "utf8")

		// Also install the agent scripts
		await this.installAgentScripts()

		vscode.window.showInformationMessage(`GitHub Actions workflow "${template.name}" installed successfully!`)
	}

	private async installAgentScripts(): Promise<void> {
		if (!this.workspaceRoot) {
			throw new Error("No workspace folder found")
		}

		const scriptsDir = path.join(this.workspaceRoot, ".github", "scripts")
		await fs.mkdir(scriptsDir, { recursive: true })

		// Install agent script
		const agentScriptPath = path.join(scriptsDir, "roocode-agent.ts")
		await fs.writeFile(agentScriptPath, this.getAgentScript(), "utf8")

		// Install package.json
		const packageJsonPath = path.join(scriptsDir, "package.json")
		await fs.writeFile(packageJsonPath, this.getAgentPackageJson(), "utf8")

		// Install README
		const readmePath = path.join(scriptsDir, "README.md")
		await fs.writeFile(readmePath, this.getAgentReadme(), "utf8")
	}

	public async uninstallWorkflow(filename: string): Promise<void> {
		if (!this.workspaceRoot) {
			throw new Error("No workspace folder found")
		}

		const workflowPath = path.join(this.workspaceRoot, this.config.workflowsPath, filename)

		try {
			await fs.unlink(workflowPath)
			vscode.window.showInformationMessage(`Workflow "${filename}" uninstalled successfully!`)
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to uninstall workflow: ${error}`)
		}
	}

	public async getInstalledWorkflows(): Promise<string[]> {
		if (!this.workspaceRoot) {
			return []
		}

		const workflowsDir = path.join(this.workspaceRoot, this.config.workflowsPath)

		try {
			const files = await fs.readdir(workflowsDir)
			return files.filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
		} catch {
			return []
		}
	}

	public async setupGitHubRepository(): Promise<void> {
		if (!this.workspaceRoot) {
			throw new Error("No workspace folder found")
		}

		// Check if git repository exists
		try {
			await execAsync("git status", { cwd: this.workspaceRoot })
		} catch {
			vscode.window.showErrorMessage("This is not a git repository. Please initialize git first.")
			return
		}

		// Get repository information
		const { stdout: remoteUrl } = await execAsync("git remote get-url origin", {
			cwd: this.workspaceRoot,
		})

		if (!remoteUrl.includes("github.com")) {
			vscode.window.showErrorMessage("This repository is not hosted on GitHub.")
			return
		}

		// Extract owner and repo from URL
		const match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/)
		if (!match) {
			vscode.window.showErrorMessage("Could not parse GitHub repository URL.")
			return
		}

		const [, owner, repo] = match

		// Show setup instructions
		const message = `
GitHub Actions Bot Setup Instructions:

1. Go to https://github.com/${owner}/${repo}/settings/secrets/actions
2. Add the following secrets:
   - ANTHROPIC_API_KEY (or OPENAI_API_KEY)
   
3. Go to Settings > Actions > General
4. Enable "Read and write permissions"
5. Check "Allow GitHub Actions to create and approve pull requests"

6. Install workflows using the GitHub Actions view in Roo Code
`

		vscode.window.showInformationMessage(message, { modal: true })
	}

	public async testBotConnection(): Promise<boolean> {
		// This would test the connection to the AI provider
		// For now, just check if configuration is valid
		if (!this.config.enabled) {
			vscode.window.showWarningMessage("GitHub Actions bot is not enabled")
			return false
		}

		if (!this.config.modelProvider) {
			vscode.window.showErrorMessage("No model provider configured")
			return false
		}

		vscode.window.showInformationMessage("Bot configuration is valid!")
		return true
	}

	// Workflow template content methods
	private getRooCodeBotWorkflow(): string {
		return `name: RooCode Agent Bot

on:
  issues:
    types: [opened, edited]
  issue_comment:
    types: [created, edited]
  pull_request:
    types: [opened, edited, synchronize]
  pull_request_review_comment:
    types: [created, edited]
  workflow_dispatch:
    inputs:
      issue_number:
        description: 'Issue number to process'
        required: false
        type: string
      pr_number:
        description: 'PR number to process'
        required: false
        type: string

jobs:
  process-event:
    runs-on: ubuntu-latest
    if: |
      (github.event_name == 'issues' && contains(github.event.issue.body, '/roo')) ||
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '/roo')) ||
      (github.event_name == 'pull_request' && contains(github.event.pull_request.body, '/roo')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '/roo')) ||
      github.event_name == 'workflow_dispatch'
    
    permissions:
      contents: write
      issues: write
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd .github/scripts
          npm install
      
      - name: Process Event
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          MODEL_PROVIDER: \${{ vars.MODEL_PROVIDER || '${this.config.modelProvider}' }}
          MODEL_NAME: \${{ vars.MODEL_NAME || '${this.config.modelName}' }}
          MAX_TOKENS: \${{ vars.MAX_TOKENS || '8192' }}
          TEMPERATURE: \${{ vars.TEMPERATURE || '0.2' }}
        run: |
          cd .github/scripts
          npm start
`
	}

	private getIssueTriageWorkflow(): string {
		return `name: Issue Triage Bot

on:
  issues:
    types: [opened]

jobs:
  triage:
    runs-on: ubuntu-latest
    permissions:
      issues: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd .github/scripts
          npm install
      
      - name: Triage Issue
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          ISSUE_NUMBER: \${{ github.event.issue.number }}
        run: |
          cd .github/scripts
          echo "Triaging issue #\$ISSUE_NUMBER"
          npm start -- --triage
`
	}

	private getPRAutoReviewWorkflow(): string {
		return `name: PR Auto-Review Bot

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd .github/scripts
          npm install
      
      - name: Review PR
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
        run: |
          cd .github/scripts
          echo "Reviewing PR #\$PR_NUMBER"
          npm start -- --review
`
	}

	private getAutoFixWorkflow(): string {
		return `name: Auto-Fix Bot

on:
  push:
    branches: [ main, develop ]
  workflow_dispatch:

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
          fetch-depth: 0
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd .github/scripts
          npm install
      
      - name: Run Auto-Fix
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          cd .github/scripts
          echo "Running auto-fix..."
          npm start -- --auto-fix
`
	}

	private getAgentScript(): string {
		// Return the full agent script content
		// This is a simplified version - the full script is in .github/scripts/roocode-agent.ts
		return `#!/usr/bin/env tsx

import { Octokit } from '@octokit/rest';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
// ... rest of the agent script implementation
// See .github/scripts/roocode-agent.ts for full implementation
`
	}

	private getAgentPackageJson(): string {
		return JSON.stringify(
			{
				name: "roocode-agent-scripts",
				version: "1.0.0",
				description: "RooCode Agent GitHub Actions Bot",
				type: "module",
				scripts: {
					start: "tsx roocode-agent.ts",
				},
				dependencies: {
					"@octokit/rest": "^20.0.2",
					"@anthropic-ai/sdk": "^0.37.0",
					openai: "^5.12.2",
					"@modelcontextprotocol/sdk": "^1.12.0",
					tsx: "^4.19.3",
				},
				devDependencies: {
					"@types/node": "^20.0.0",
				},
			},
			null,
			2,
		)
	}

	private getAgentReadme(): string {
		return `# RooCode Agent - GitHub Actions Bot

See the full documentation in the main README.

## Quick Start

1. Configure repository secrets
2. Enable GitHub Actions
3. Create an issue or PR with /roo command

## Commands

- /roo plan - Create implementation plan
- /roo approve - Approve and implement
- /roo fix - Direct fix
- /roo review - Review PR
- /roo triage - Triage issue
- /roo label - Add labels
`
	}
}
