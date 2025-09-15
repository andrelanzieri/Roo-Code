#!/bin/bash

set -e

echo "🚀 Building Roo Code for JetBrains IDEs (Development Mode)"
echo "========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"  # Main Roo Code project root
RUNVSAGENT_DIR="$SCRIPT_DIR/RunVSAgent"

echo -e "${BLUE}⚡ Development mode: Skipping full rebuild for faster iteration${NC}"
echo ""

# Step 1: Quick build of Roo Code extension
echo -e "${YELLOW}📦 Step 1: Quick building Roo Code extension...${NC}"
cd "$PROJECT_ROOT"

# Build the extension (dev mode - no minification)
echo "Building Roo Code bundle (dev mode)..."
NODE_ENV=development pnpm run bundle

# Step 2: Update Roo Code in RunVSAgent
echo -e "${YELLOW}📦 Step 2: Updating Roo Code in RunVSAgent...${NC}"

# Create the roo-code directory in deps
ROO_CODE_DIR="$RUNVSAGENT_DIR/deps/roo-code"
mkdir -p "$ROO_CODE_DIR"

# Copy the built extension
echo "Copying extension files..."
cp "$PROJECT_ROOT/src/dist/extension.js" "$ROO_CODE_DIR/extension.cjs"

# Copy assets if they exist
if [ -d "$PROJECT_ROOT/src/assets" ]; then
    cp -r "$PROJECT_ROOT/src/assets" "$ROO_CODE_DIR/"
fi

# Update extension.package.json
echo "Updating extension.package.json..."
cat > "$ROO_CODE_DIR/extension.package.json" << 'EOF'
{
  "name": "roo-code",
  "displayName": "Roo Code (Dev)",
  "description": "A whole dev team of AI agents in your editor - Development Build",
  "publisher": "RooVeterinaryInc",
  "version": "3.28.0-dev",
  "engines": {
    "vscode": "^1.84.0"
  },
  "activationEvents": [
    "onStartupFinished",
    "*"
  ],
  "main": "./extension.cjs",
  "contributes": {
    "commands": [
      {
        "command": "roo-code.newTask",
        "title": "Roo Code: New Task"
      },
      {
        "command": "roo-code.openSettings",
        "title": "Roo Code: Open Settings"
      }
    ]
  },
  "extensionDependencies": []
}
EOF

# Step 3: Quick build of extension host (if needed)
echo -e "${YELLOW}📦 Step 3: Checking extension host...${NC}"
cd "$RUNVSAGENT_DIR/extension_host"

if [ ! -d "dist" ]; then
    echo "Building extension host for first time..."
    npm install
    npm run build
else
    echo "Extension host already built, skipping..."
fi

# Step 4: Quick build of JetBrains plugin
echo -e "${YELLOW}📦 Step 4: Building JetBrains plugin (dev mode)...${NC}"
cd "$RUNVSAGENT_DIR/jetbrains_plugin"

# Build with Gradle (skip tests for speed)
echo "Building JetBrains plugin..."
./gradlew buildPlugin -x test

# Step 5: Package
echo -e "${YELLOW}📦 Step 5: Creating development package...${NC}"

# Create output directory
OUTPUT_DIR="$SCRIPT_DIR/dist"
mkdir -p "$OUTPUT_DIR"

# Copy the built plugin
PLUGIN_FILE=$(find "$RUNVSAGENT_DIR/jetbrains_plugin/build/distributions" -name "*.zip" | head -1)
if [ -f "$PLUGIN_FILE" ]; then
    # Add timestamp to dev builds
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    cp "$PLUGIN_FILE" "$OUTPUT_DIR/RunVSAgent-RooCode-dev-${TIMESTAMP}.zip"
    # Also keep a latest dev version
    cp "$PLUGIN_FILE" "$OUTPUT_DIR/RunVSAgent-RooCode-dev-latest.zip"
    
    echo -e "${GREEN}✅ Development build successful!${NC}"
    echo -e "${GREEN}📦 Plugin package created at:${NC}"
    echo -e "  - $OUTPUT_DIR/RunVSAgent-RooCode-dev-latest.zip"
    echo -e "  - $OUTPUT_DIR/RunVSAgent-RooCode-dev-${TIMESTAMP}.zip"
    echo ""
    echo -e "${BLUE}💡 Tip: Use 'dev-latest.zip' for quick testing${NC}"
else
    echo -e "${RED}❌ Error: Could not find built plugin file${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Development build complete!${NC}"