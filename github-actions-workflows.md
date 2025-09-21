# GitHub Actions Workflows for RooCode Agent Bot

Due to GitHub security restrictions, workflow files cannot be automatically created via GitHub Apps. Please manually add these files to your repository.

## Required Files

### 1. `.github/workflows/roocode-bot.yml`

```yaml
name: RooCode Agent Bot

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
                description: "Issue number to process"
                required: false
                type: string
            pr_number:
                description: "PR number to process"
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
                  node-version: "20"

            - name: Install dependencies
              run: |
                  cd .github/scripts
                  npm install

            - name: Process Event
              env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
                  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
                  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
                  OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
                  MODEL_PROVIDER: ${{ vars.MODEL_PROVIDER || 'anthropic' }}
                  MODEL_NAME: ${{ vars.MODEL_NAME || 'claude-3-5-sonnet-20241022' }}
                  MAX_TOKENS: ${{ vars.MAX_TOKENS || '8192' }}
                  TEMPERATURE: ${{ vars.TEMPERATURE || '0.2' }}
              run: |
                  cd .github/scripts
                  npm start
```

### 2. `.github/scripts/package.json`

```json
{
	"name": "roocode-agent-scripts",
	"version": "1.0.0",
	"description": "RooCode Agent GitHub Actions Bot",
	"type": "module",
	"scripts": {
		"start": "tsx roocode-agent.ts"
	},
	"dependencies": {
		"@octokit/rest": "^20.0.2",
		"@anthropic-ai/sdk": "^0.37.0",
		"openai": "^5.12.2",
		"@modelcontextprotocol/sdk": "^1.12.0",
		"tsx": "^4.19.3"
	},
	"devDependencies": {
		"@types/node": "^20.0.0"
	}
}
```

### 3. `.github/scripts/roocode-agent.ts`

Create this file with the full agent implementation. The complete code is available in the PR description.

### 4. `.github/scripts/README.md`

Documentation for the GitHub Actions bot setup and usage.

## Setup Instructions

1. **Add the workflow files manually** to your repository
2. **Configure Repository Secrets** (Settings → Secrets and variables → Actions):

    - `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` (at least one required)
    - `OPENROUTER_API_KEY` (optional)

3. **Configure Repository Variables** (Settings → Secrets and variables → Actions → Variables):

    - `MODEL_PROVIDER`: `anthropic`, `openai`, or `openrouter`
    - `MODEL_NAME`: Model identifier
    - `MAX_TOKENS`: Maximum response tokens
    - `TEMPERATURE`: Model temperature (0-1)

4. **Enable GitHub Actions Permissions**:
    - Go to Settings → Actions → General
    - Select "Read and write permissions"
    - Check "Allow GitHub Actions to create and approve pull requests"

## Available Commands

- `/roo plan` - Create implementation plan
- `/roo approve` - Approve plan and implement
- `/roo fix` - Direct fix implementation
- `/roo review` - Review pull request
- `/roo triage` - Triage issue
- `/roo label` - Add labels to issue
- `/roo` - General bot interaction

## Testing

Create an issue or PR comment with `/roo` to trigger the bot.
