# RooCode Agent - GitHub Actions Bot

This directory contains the RooCode Agent bot that runs in GitHub Actions to automatically handle issues and pull requests.

## Features

The RooCode Agent bot supports the following commands:

### Issue Commands

- `/roo` - General command to interact with the bot
- `/roo plan` - Create a detailed implementation plan for an issue
- `/roo approve` - Approve a plan and start implementation
- `/roo fix` - Directly implement a fix for an issue
- `/roo triage` - Analyze and triage an issue (priority, labels, complexity)
- `/roo label` - Automatically add appropriate labels to an issue

### Pull Request Commands

- `/roo review` - Perform a code review on a pull request
- `/roo` - General interaction with the bot on PRs

## Setup Instructions

### 1. Repository Secrets

Configure the following secrets in your repository settings (`Settings > Secrets and variables > Actions`):

**Required (at least one):**

- `OPENAI_API_KEY` - OpenAI API key for GPT models
- `ANTHROPIC_API_KEY` - Anthropic API key for Claude models
- `OPENROUTER_API_KEY` - OpenRouter API key for various models

**Automatic:**

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions

### 2. Repository Variables

Configure these variables in your repository settings (`Settings > Secrets and variables > Actions > Variables`):

- `MODEL_PROVIDER` - Choose: `openai`, `anthropic`, or `openrouter` (default: `anthropic`)
- `MODEL_NAME` - Model to use (default: `claude-3-5-sonnet-20241022`)
- `MAX_TOKENS` - Maximum tokens for responses (default: `8192`)
- `TEMPERATURE` - Model temperature 0-1 (default: `0.2`)

### 3. Enable GitHub Actions

1. Go to `Settings > Actions > General`
2. Under "Workflow permissions", select "Read and write permissions"
3. Check "Allow GitHub Actions to create and approve pull requests"
4. Save the settings

### 4. Test the Bot

Create an issue or comment with `/roo` to trigger the bot:

```
/roo plan

Please help me implement a new feature for user authentication.
```

## Workflow Triggers

The bot is triggered by:

- **Issue events**: When issues are opened or edited containing `/roo`
- **Issue comments**: When comments are created or edited containing `/roo`
- **Pull request events**: When PRs are opened, edited, or synchronized containing `/roo`
- **PR review comments**: When review comments are created or edited containing `/roo`
- **Manual dispatch**: Can be triggered manually from the Actions tab

## Architecture

```
.github/
├── workflows/
│   └── roocode-bot.yml       # GitHub Actions workflow definition
└── scripts/
    ├── roocode-agent.ts      # Main bot logic
    ├── package.json          # Dependencies
    └── README.md            # This file
```

## Development

To test locally:

```bash
cd .github/scripts
npm install
npm start
```

Set environment variables:

```bash
export GITHUB_TOKEN=your_token
export ANTHROPIC_API_KEY=your_key
export GITHUB_EVENT_PATH=path/to/event.json
export GITHUB_REPOSITORY=owner/repo
export GITHUB_EVENT_NAME=issues
```

## Security Considerations

- API keys are stored as encrypted secrets
- The bot only has permissions granted by the `GITHUB_TOKEN`
- All actions are logged in GitHub Actions
- The bot identifies itself in all comments

## Extending the Bot

To add new commands:

1. Add the command detection in `extractCommands()`
2. Implement the handler function
3. Add the case in `processIssue()` or `processPullRequest()`
4. Update this README with the new command

## Troubleshooting

Check the GitHub Actions logs:

1. Go to the "Actions" tab in your repository
2. Click on the "RooCode Agent Bot" workflow
3. Select a run to view detailed logs

Common issues:

- Missing API keys: Check repository secrets
- Insufficient permissions: Check workflow permissions
- Model errors: Verify MODEL_PROVIDER and MODEL_NAME variables
