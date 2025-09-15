#!/bin/bash
set -e

echo "🔄 Starting Roo Code development environment..."

# Check if Chrome is accessible
if command -v google-chrome &> /dev/null || command -v google-chrome-stable &> /dev/null; then
    CHROME_PATH=$(which google-chrome || which google-chrome-stable)
    echo "✅ Chrome found at: $CHROME_PATH"
    
    # Test Chrome can run headless
    echo "🧪 Testing Chrome headless mode..."
    timeout 5 $CHROME_PATH --headless --no-sandbox --disable-gpu --dump-dom https://example.com > /dev/null 2>&1 && \
        echo "✅ Chrome headless mode works!" || \
        echo "⚠️ Chrome headless test failed, but this might be okay"
else
    echo "⚠️ Chrome not found. The browser tool may not work correctly."
fi

# Check Docker availability
if command -v docker &> /dev/null; then
    echo "🐳 Docker is available"
    
    # Check if Docker daemon is running
    if docker info > /dev/null 2>&1; then
        echo "✅ Docker daemon is running"
        
        # Optionally pre-pull the browserless image
        if [ "${PRELOAD_DOCKER_IMAGES:-false}" = "true" ]; then
            echo "📥 Pre-loading Docker browser image..."
            docker pull browserless/chrome:latest || true
        fi
    else
        echo "⚠️ Docker daemon is not running. Docker browser option won't be available."
    fi
else
    echo "ℹ️ Docker is not available. Docker browser option won't be available."
fi

# Display environment info
echo ""
echo "📊 Environment Information:"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - pnpm: $(pnpm --version 2>/dev/null || echo 'Not installed')"
echo "  - Chrome: $(google-chrome --version 2>/dev/null || google-chrome-stable --version 2>/dev/null || echo 'Not installed')"
echo "  - Docker: $(docker --version 2>/dev/null || echo 'Not installed')"
echo ""

# Check for missing dependencies
MISSING_DEPS=()
for lib in libatk-1.0.so.0 libatk-bridge-2.0.so.0 libcups.so.2; do
    if ! ldconfig -p | grep -q $lib; then
        MISSING_DEPS+=($lib)
    fi
done

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "⚠️ Some Chrome dependencies might be missing: ${MISSING_DEPS[*]}"
    echo "   Run: sudo apt-get update && sudo apt-get install -y libatk1.0-0 libatk-bridge2.0-0 libcups2"
else
    echo "✅ All critical Chrome dependencies are installed"
fi

echo ""
echo "🚀 Roo Code development environment is ready!"