# Roo Code GitHub Codespaces Configuration

This directory contains the configuration for running Roo Code in GitHub Codespaces, providing a fully configured development environment with automatic Chrome/Puppeteer dependency installation.

## Features

### Automatic Dependency Installation

- **Chrome Browser**: Google Chrome Stable is automatically installed with all required dependencies
- **Docker Support**: Docker-in-Docker feature enables containerized browser option
- **Node.js Environment**: Pre-configured TypeScript/Node.js development container
- **VS Code Extensions**: Essential extensions are pre-installed

### Browser Tool Support

The configuration ensures the browser tool works seamlessly in Codespaces by:

1. **Automatic Chrome Installation**: Chrome and all its dependencies are installed during container creation
2. **Dependency Detection**: The extension automatically detects and installs missing dependencies
3. **Docker Fallback**: If Chrome fails, Docker browser container can be used as fallback
4. **Environment Variables**: Proper configuration for Puppeteer to use system Chrome

## Configuration Options

### Docker Browser (Optional)

You can enable Docker-based browser isolation in VS Code settings:

```json
{
	"roo-cline.browserDocker.enabled": true,
	"roo-cline.browserDocker.image": "browserless/chrome:latest",
	"roo-cline.browserDocker.autoStart": true
}
```

### Benefits of Docker Browser

- **Isolation**: Browser runs in a separate container
- **Consistency**: Same browser environment across all systems
- **No Dependencies**: No need to install Chrome dependencies on host
- **Security**: Enhanced security through containerization

## Troubleshooting

### Browser Tool Not Working?

1. **Check Chrome Installation**:

    ```bash
    google-chrome --version
    # or
    google-chrome-stable --version
    ```

2. **Test Chrome Headless**:

    ```bash
    google-chrome --headless --no-sandbox --disable-gpu --dump-dom https://example.com
    ```

3. **Check Missing Dependencies**:

    ```bash
    ldd $(which google-chrome) | grep "not found"
    ```

4. **Install Missing Dependencies Manually**:

    ```bash
    sudo apt-get update
    sudo apt-get install -y \
      libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
      libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
      libxrandr2 libgbm1 libasound2
    ```

5. **Use Docker Browser as Fallback**:
    - Enable Docker browser in settings (see Configuration Options above)
    - Ensure Docker is running: `docker info`
    - The extension will automatically use Docker if Chrome fails

### Docker Issues?

1. **Check Docker Status**:

    ```bash
    docker info
    ```

2. **Pull Browser Image Manually**:

    ```bash
    docker pull browserless/chrome:latest
    ```

3. **Test Docker Browser**:
    ```bash
    docker run -d --name test-browser -p 3000:3000 browserless/chrome:latest
    # Visit http://localhost:3000 to verify
    docker stop test-browser && docker rm test-browser
    ```

## Files in This Directory

- **devcontainer.json**: Main configuration file for the dev container
- **post-create.sh**: Script that runs after container creation (installs dependencies)
- **post-start.sh**: Script that runs each time the container starts (verifies setup)
- **README.md**: This documentation file

## How It Works

1. **Container Creation**: When you create a Codespace, it uses the TypeScript/Node.js base image
2. **Feature Installation**: Docker-in-Docker and Chrome features are installed
3. **Post-Create Script**: Installs Chrome dependencies and builds the project
4. **Post-Start Script**: Verifies the environment on each container start
5. **Automatic Detection**: The extension detects the Codespace environment and adapts accordingly

## Environment Variables

The following environment variables are set automatically:

- `CODESPACES=true`: Indicates running in GitHub Codespaces
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true`: Prevents Puppeteer from downloading Chromium
- `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`: Points Puppeteer to system Chrome

## Support

If you encounter issues with the browser tool in Codespaces:

1. Check the troubleshooting section above
2. Review the post-start script output for warnings
3. Report issues at: https://github.com/RooCodeInc/Roo-Code/issues
