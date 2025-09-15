#!/bin/bash

echo "🚀 Setting up Roo Code development environment..."

# Update package lists
echo "📦 Updating package lists..."
sudo apt-get update

# Install Chrome dependencies for Puppeteer
echo "🌐 Installing Chrome dependencies for Puppeteer..."
sudo apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    xdg-utils

# Install Google Chrome Stable
echo "🌐 Installing Google Chrome..."
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Install additional tools that might be useful
echo "🔧 Installing additional development tools..."
sudo apt-get install -y \
    jq \
    vim \
    curl \
    git-lfs

# Set up Chrome for headless operation in container
echo "⚙️ Configuring Chrome for container environment..."
# Add Chrome flags for running in container
sudo mkdir -p /etc/chromium.d/
echo 'export CHROMIUM_FLAGS="$CHROMIUM_FLAGS --no-sandbox --disable-dev-shm-usage"' | sudo tee /etc/chromium.d/default-flags

# Install pnpm if not already installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

# Install project dependencies
echo "📦 Installing project dependencies..."
pnpm install

# Build the project
echo "🔨 Building the project..."
pnpm build || true  # Don't fail if build has issues initially

# Set up git (if in Codespace)
if [ -n "$CODESPACES" ]; then
    echo "🔧 Configuring git for Codespace..."
    git config --global --add safe.directory /workspaces/Roo-Code
fi

echo "✅ Development environment setup complete!"
echo ""
echo "🎉 Welcome to Roo Code development!"
echo ""
echo "Quick start commands:"
echo "  pnpm install    - Install dependencies"
echo "  pnpm build      - Build the project"
echo "  pnpm test       - Run tests"
echo "  pnpm dev        - Start development mode"
echo ""
echo "Chrome is installed at: $(which google-chrome-stable)"
echo "Chrome version: $(google-chrome-stable --version)"