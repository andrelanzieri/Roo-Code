# GitHub Codespaces Configuration for Roo Code

This directory contains the configuration files needed to run Roo Code in GitHub Codespaces with full browser tool support.

## What's Included

### Chrome/Chromium Support

The configuration automatically installs Google Chrome and all necessary dependencies for Puppeteer to work correctly in the Codespace environment. This resolves the issue where the browser tool would fail with missing library errors like `libatk-1.0.so.0`.

### Files

- **`devcontainer.json`**: Main configuration file that defines the development container

    - Uses Node.js 20 TypeScript image
    - Installs essential VS Code extensions
    - Configures environment variables for Puppeteer
    - Sets up port forwarding for development servers

- **`post-create.sh`**: Script that runs after the container is created
    - Installs Chrome browser and all required system libraries
    - Configures Chrome for headless operation in containers
    - Installs project dependencies
    - Sets up the development environment

## How It Works

1. When you create a new Codespace, GitHub reads the `devcontainer.json` configuration
2. It creates a container based on the specified Node.js image
3. The `post-create.sh` script runs automatically to:
    - Install Chrome and its dependencies
    - Configure Chrome with appropriate flags for container environments
    - Install pnpm and project dependencies
    - Build the project

## Browser Tool Compatibility

The browser tool now works seamlessly in Codespaces by:

- Installing all required Chrome/Chromium dependencies
- Adding necessary sandbox flags (`--no-sandbox`, `--disable-setuid-sandbox`) for container environments
- Detecting when running in Codespaces via the `CODESPACES` environment variable
- Automatically applying the correct configuration

## Testing the Browser Tool

After creating a Codespace with this configuration, you can test the browser tool:

1. Open the Roo Code extension in the Codespace
2. Try a task that uses the browser tool, such as:
    - "Open google.com and take a screenshot"
    - "Navigate to a website and extract information"
    - "Test a local development server"

## Troubleshooting

If you encounter issues:

1. **Chrome not found**: Run `.devcontainer/post-create.sh` manually
2. **Permission errors**: The script uses `sudo` where needed, but ensure you're running as the correct user
3. **Browser tool still failing**: Check that Chrome is installed: `google-chrome-stable --version`

## Environment Variables

The following environment variables are set for Puppeteer compatibility:

- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false`: Ensures Puppeteer can download Chromium if needed
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`: Points to the installed Chrome binary

## Additional Notes

- The configuration includes common development tools (git, vim, jq, curl)
- VS Code extensions for TypeScript, ESLint, and Prettier are pre-installed
- The container runs with additional capabilities for debugging (`SYS_PTRACE`)
- Ports 3000 and 5173 are automatically forwarded for web development
