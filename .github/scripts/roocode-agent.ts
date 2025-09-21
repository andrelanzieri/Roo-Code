#!/usr/bin/env tsx

import { Octokit } from "@octokit/rest"
import OpenAI from "openai"
import Anthropic from "@anthropic-ai/sdk"
import * as fs from "fs"
import * as path from "path"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

// Configuration from environment variables
const config = {
	githubToken: process.env.GITHUB_TOKEN!,
	openaiApiKey: process.env.OPENAI_API_KEY,
	anthropicApiKey: process.env.ANTHROPIC_API_KEY,
	openRouterApiKey: process.env.OPENROUTER_API_KEY,
	modelProvider: process.env.MODEL_PROVIDER || "anthropic",
	modelName: process.env.MODEL_NAME || "claude-3-5-sonnet-20241022",
	maxTokens: parseInt(process.env.MAX_TOKENS || "8192"),
	temperature: parseFloat(process.env.TEMPERATURE || "0.2"),
}

// Initialize GitHub client
const octokit = new Octokit({
	auth: config.githubToken,
})

// Initialize AI clients based on provider
let aiClient: any
if (config.modelProvider === "openai" && config.openaiApiKey) {
	aiClient = new OpenAI({ apiKey: config.openaiApiKey })
} else if (config.modelProvider === "anthropic" && config.anthropicApiKey) {
	aiClient = new Anthropic({ apiKey: config.anthropicApiKey })
} else if (config.modelProvider === "openrouter" && config.openRouterApiKey) {
	aiClient = new OpenAI({
		apiKey: config.openRouterApiKey,
		baseURL: "https://openrouter.ai/api/v1",
	})
} else {
	console.error("No valid AI provider configured")
	process.exit(1)
}

// Parse GitHub event
const eventPath = process.env.GITHUB_EVENT_PATH
const event = JSON.parse(fs.readFileSync(eventPath!, "utf8"))
const context = {
	repo: process.env.GITHUB_REPOSITORY!.split("/")[1],
	owner: process.env.GITHUB_REPOSITORY!.split("/")[0],
	eventName: process.env.GITHUB_EVENT_NAME!,
}

interface Command {
	type: "plan" | "approve" | "fix" | "review" | "triage" | "label" | "comment"
	content?: string
	labels?: string[]
	approved?: boolean
}

// Extract commands from text
function extractCommands(text: string): Command[] {
	const commands: Command[] = []

	if (text.includes("/roo plan")) {
		commands.push({ type: "plan" })
	}
	if (text.includes("/roo approve")) {
		commands.push({ type: "approve", approved: true })
	}
	if (text.includes("/roo fix")) {
		commands.push({ type: "fix" })
	}
	if (text.includes("/roo review")) {
		commands.push({ type: "review" })
	}
	if (text.includes("/roo triage")) {
		commands.push({ type: "triage" })
	}
	if (text.includes("/roo label")) {
		commands.push({ type: "label" })
	}
	if (text.includes("/roo")) {
		// Generic command - analyze and respond
		commands.push({ type: "comment" })
	}

	return commands
}

// Get AI response
async function getAIResponse(prompt: string, systemPrompt: string): Promise<string> {
	try {
		if (config.modelProvider === "anthropic") {
			const response = await aiClient.messages.create({
				model: config.modelName,
				max_tokens: config.maxTokens,
				temperature: config.temperature,
				system: systemPrompt,
				messages: [{ role: "user", content: prompt }],
			})
			return response.content[0].text
		} else {
			// OpenAI or OpenRouter
			const response = await aiClient.chat.completions.create({
				model: config.modelName,
				max_tokens: config.maxTokens,
				temperature: config.temperature,
				messages: [
					{ role: "system", content: systemPrompt },
					{ role: "user", content: prompt },
				],
			})
			return response.choices[0].message.content || ""
		}
	} catch (error) {
		console.error("Error getting AI response:", error)
		throw error
	}
}

// Process issue event
async function processIssue(issue: any, comment?: any) {
	const text = comment?.body || issue.body || ""
	const commands = extractCommands(text)

	if (commands.length === 0) return

	for (const command of commands) {
		switch (command.type) {
			case "plan":
				await createPlan(issue)
				break
			case "approve":
				await approvePlan(issue)
				break
			case "fix":
				await implementFix(issue)
				break
			case "triage":
				await triageIssue(issue)
				break
			case "label":
				await labelIssue(issue)
				break
			case "comment":
				await respondToComment(issue, text)
				break
		}
	}
}

// Process pull request event
async function processPullRequest(pr: any, comment?: any) {
	const text = comment?.body || pr.body || ""
	const commands = extractCommands(text)

	if (commands.length === 0) return

	for (const command of commands) {
		switch (command.type) {
			case "review":
				await reviewPullRequest(pr)
				break
			case "comment":
				await respondToPRComment(pr, text)
				break
		}
	}
}

// Create a plan for an issue
async function createPlan(issue: any) {
	const systemPrompt = `You are RooCode-Agent, an AI assistant that helps with GitHub issues.
Your task is to analyze the issue and create a detailed implementation plan.
Format your response as a clear, step-by-step plan with:
1. Understanding of the problem
2. Proposed solution
3. Implementation steps
4. Testing approach
5. Potential risks or considerations

End your plan with: "Reply with '/roo approve' to proceed with implementation."`

	const prompt = `Issue #${issue.number}: ${issue.title}

${issue.body}

Please create a detailed implementation plan for this issue.`

	const plan = await getAIResponse(prompt, systemPrompt)

	await octokit.issues.createComment({
		owner: context.owner,
		repo: context.repo,
		issue_number: issue.number,
		body: `## 📋 Implementation Plan

${plan}

---
*Generated by RooCode-Agent*`,
	})
}

// Approve and implement plan
async function approvePlan(issue: any) {
	// Check if there's a plan in the comments
	const comments = await octokit.issues.listComments({
		owner: context.owner,
		repo: context.repo,
		issue_number: issue.number,
	})

	const planComment = comments.data.find(
		(c) => c.body?.includes("Implementation Plan") && c.user?.login === "github-actions[bot]",
	)

	if (!planComment) {
		await octokit.issues.createComment({
			owner: context.owner,
			repo: context.repo,
			issue_number: issue.number,
			body: `❌ No plan found to approve. Please run '/roo plan' first.`,
		})
		return
	}

	await octokit.issues.createComment({
		owner: context.owner,
		repo: context.repo,
		issue_number: issue.number,
		body: `✅ Plan approved! Starting implementation...

*Note: This is a demonstration. In a real scenario, the bot would now create a branch and implement the changes.*`,
	})

	// In a real implementation, this would create a branch and start coding
	await implementFix(issue)
}

// Implement a fix for an issue
async function implementFix(issue: any) {
	// This is a simplified version - in reality, this would:
	// 1. Create a new branch
	// 2. Make code changes based on the issue
	// 3. Commit and push changes
	// 4. Create a pull request

	const branchName = `fix/issue-${issue.number}`

	try {
		// Create a simple demonstration PR
		await octokit.issues.createComment({
			owner: context.owner,
			repo: context.repo,
			issue_number: issue.number,
			body: `🔧 Working on implementation...

- Creating branch: \`${branchName}\`
- Analyzing codebase...
- Implementing changes...

*Note: This is a demonstration. In a production environment, the bot would actually create and modify files.*`,
		})
	} catch (error) {
		console.error("Error implementing fix:", error)
		await octokit.issues.createComment({
			owner: context.owner,
			repo: context.repo,
			issue_number: issue.number,
			body: `❌ Error implementing fix: ${error}`,
		})
	}
}

// Triage an issue
async function triageIssue(issue: any) {
	const systemPrompt = `You are RooCode-Agent. Analyze this issue and suggest:
1. Priority level (P0-Critical, P1-High, P2-Medium, P3-Low)
2. Relevant labels (bug, enhancement, documentation, etc.)
3. Estimated complexity (Easy, Medium, Hard)
4. Suggested assignee type (frontend, backend, fullstack, devops)`

	const prompt = `Issue #${issue.number}: ${issue.title}

${issue.body}

Please triage this issue.`

	const response = await getAIResponse(prompt, systemPrompt)

	await octokit.issues.createComment({
		owner: context.owner,
		repo: context.repo,
		issue_number: issue.number,
		body: `## 🏷️ Issue Triage

${response}

---
*Generated by RooCode-Agent*`,
	})
}

// Label an issue based on content
async function labelIssue(issue: any) {
	const systemPrompt = `You are RooCode-Agent. Analyze this issue and suggest appropriate labels.
Common labels include: bug, enhancement, documentation, question, help wanted, good first issue, 
frontend, backend, performance, security, testing, ui/ux.
Return only a comma-separated list of labels.`

	const prompt = `Issue #${issue.number}: ${issue.title}

${issue.body}

Suggest appropriate labels for this issue.`

	const response = await getAIResponse(prompt, systemPrompt)
	const labels = response
		.split(",")
		.map((l) => l.trim())
		.filter((l) => l)

	if (labels.length > 0) {
		try {
			await octokit.issues.addLabels({
				owner: context.owner,
				repo: context.repo,
				issue_number: issue.number,
				labels: labels,
			})

			await octokit.issues.createComment({
				owner: context.owner,
				repo: context.repo,
				issue_number: issue.number,
				body: `🏷️ Added labels: ${labels.map((l) => `\`${l}\``).join(", ")}`,
			})
		} catch (error) {
			console.error("Error adding labels:", error)
		}
	}
}

// Review a pull request
async function reviewPullRequest(pr: any) {
	const systemPrompt = `You are RooCode-Agent, a code reviewer. Review this pull request and provide:
1. Summary of changes
2. Code quality assessment
3. Potential issues or bugs
4. Suggestions for improvement
5. Security considerations
6. Overall recommendation (Approve, Request Changes, or Comment)`

	// Get PR diff
	const diff = await octokit.pulls.get({
		owner: context.owner,
		repo: context.repo,
		pull_number: pr.number,
		mediaType: { format: "diff" },
	})

	const prompt = `Pull Request #${pr.number}: ${pr.title}

Description:
${pr.body}

Diff:
${diff.data}

Please review this pull request.`

	const review = await getAIResponse(prompt, systemPrompt)

	await octokit.pulls.createReview({
		owner: context.owner,
		repo: context.repo,
		pull_number: pr.number,
		body: `## 🔍 Code Review

${review}

---
*Generated by RooCode-Agent*`,
		event: "COMMENT",
	})
}

// Respond to a comment on an issue
async function respondToComment(issue: any, commentText: string) {
	const systemPrompt = `You are RooCode-Agent, an AI assistant for the Roo-Code project.
Respond helpfully to the user's comment or question about this issue.
Be concise, technical, and actionable.`

	const prompt = `Issue #${issue.number}: ${issue.title}

Issue Description:
${issue.body}

User Comment:
${commentText}

Please provide a helpful response.`

	const response = await getAIResponse(prompt, systemPrompt)

	await octokit.issues.createComment({
		owner: context.owner,
		repo: context.repo,
		issue_number: issue.number,
		body: response + "\n\n---\n*Response by RooCode-Agent*",
	})
}

// Respond to a comment on a PR
async function respondToPRComment(pr: any, commentText: string) {
	const systemPrompt = `You are RooCode-Agent, an AI assistant for the Roo-Code project.
Respond helpfully to the user's comment or question about this pull request.
Be concise, technical, and actionable.`

	const prompt = `Pull Request #${pr.number}: ${pr.title}

PR Description:
${pr.body}

User Comment:
${commentText}

Please provide a helpful response.`

	const response = await getAIResponse(prompt, systemPrompt)

	await octokit.issues.createComment({
		owner: context.owner,
		repo: context.repo,
		issue_number: pr.number,
		body: response + "\n\n---\n*Response by RooCode-Agent*",
	})
}

// Main execution
async function main() {
	try {
		console.log(`Processing ${context.eventName} event`)

		if (context.eventName === "issues") {
			await processIssue(event.issue)
		} else if (context.eventName === "issue_comment") {
			await processIssue(event.issue, event.comment)
		} else if (context.eventName === "pull_request") {
			await processPullRequest(event.pull_request)
		} else if (context.eventName === "pull_request_review_comment") {
			await processPullRequest(event.pull_request, event.comment)
		} else if (context.eventName === "workflow_dispatch") {
			// Handle manual trigger
			if (event.inputs?.issue_number) {
				const issue = await octokit.issues.get({
					owner: context.owner,
					repo: context.repo,
					issue_number: parseInt(event.inputs.issue_number),
				})
				await processIssue(issue.data)
			} else if (event.inputs?.pr_number) {
				const pr = await octokit.pulls.get({
					owner: context.owner,
					repo: context.repo,
					pull_number: parseInt(event.inputs.pr_number),
				})
				await processPullRequest(pr.data)
			}
		}

		console.log("Event processed successfully")
	} catch (error) {
		console.error("Error processing event:", error)
		process.exit(1)
	}
}

// Run the bot
main()
