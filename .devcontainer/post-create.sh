#!/bin/bash
set -e

echo "🚀 Setting up Roo Code development environment..."

# Update package lists
echo "📦 Updating package lists..."
sudo apt-get update

# Install Chrome dependencies that might be missing
echo "🌐 Installing Chrome dependencies..."
sudo apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libpango-1.0-0 \
    libcairo2 \
    libxshmfence1 \
    libnss3 \
    libnssutil3 \
    libnspr4 \
    libx11-xcb1 \
    libxcb-dri3-0 \
    fonts-liberation \
    libappindicator3-1 \
    libxss1 \
    lsb-release \
    xdg-utils \
    wget

# Verify Chrome installation
if ! command -v google-chrome &> /dev/null && ! command -v google-chrome-stable &> /dev/null; then
    echo "⚠️ Chrome not found, installing Google Chrome..."
    wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
    sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list'
    sudo apt-get update
    sudo apt-get install -y google-chrome-stable
fi

# Install project dependencies
echo "📚 Installing project dependencies..."
npm install -g pnpm
pnpm install

# Build the project
echo "🔨 Building the project..."
pnpm run bundle

# Create a symlink for Chrome if needed
if [ -f "/usr/bin/google-chrome-stable" ] && [ ! -f "/usr/bin/google-chrome" ]; then
    sudo ln -sf /usr/bin/google-chrome-stable /usr/bin/google-chrome
fi

# Set up Docker if available
if command -v docker &> /dev/null; then
    echo "🐳 Docker is available, pulling browserless/chrome image..."
    docker pull browserless/chrome:latest || true
fi

echo "✅ Development environment setup complete!"
echo ""
echo "📝 Notes:"
echo "  - Chrome is installed at: $(which google-chrome || which google-chrome-stable || echo 'Not found')"
echo "  - Docker is available: $(command -v docker &> /dev/null && echo 'Yes' || echo 'No')"
echo "  - The browser tool should now work correctly in this Codespace"
echo ""
echo "🎉 Happy coding with Roo Code!"