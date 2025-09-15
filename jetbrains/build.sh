#!/bin/bash

set -e

echo "🚀 Building Roo Code for JetBrains IDEs with RunVSAgent"
echo "========================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"  # Main Roo Code project root
RUNVSAGENT_DIR="$SCRIPT_DIR/RunVSAgent"

# Step 1: Update and setup RunVSAgent submodule
echo -e "${YELLOW}📦 Step 1: Setting up RunVSAgent...${NC}"
cd "$SCRIPT_DIR"
git submodule update --init --recursive

# Run RunVSAgent setup to prepare VSCode dependencies
echo "Running RunVSAgent setup..."
cd "$RUNVSAGENT_DIR"
if [ -f "scripts/setup.sh" ]; then
    ./scripts/setup.sh --skip-deps
else
    echo -e "${RED}Warning: RunVSAgent setup script not found${NC}"
fi
cd "$SCRIPT_DIR"

# Step 2: Build Roo Code extension
echo -e "${YELLOW}📦 Step 2: Building Roo Code extension...${NC}"
cd "$PROJECT_ROOT"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing Roo Code dependencies..."
    pnpm install
fi

# Build the extension
echo "Building Roo Code bundle..."
pnpm run bundle

# Step 3: Prepare Roo Code for RunVSAgent
echo -e "${YELLOW}📦 Step 3: Preparing Roo Code for RunVSAgent...${NC}"

# Create the roo-code directory in deps
ROO_CODE_DIR="$RUNVSAGENT_DIR/deps/roo-code"
mkdir -p "$ROO_CODE_DIR"

# Link to the main project's built extension
echo "Copying extension files from main project..."
if [ -f "$PROJECT_ROOT/src/dist/extension.js" ]; then
    cp "$PROJECT_ROOT/src/dist/extension.js" "$ROO_CODE_DIR/extension.cjs"
else
    echo -e "${RED}Error: extension.js not found. Make sure to build the main project first.${NC}"
    exit 1
fi

# Copy assets from main project
if [ -d "$PROJECT_ROOT/src/assets" ]; then
    cp -r "$PROJECT_ROOT/src/assets" "$ROO_CODE_DIR/"
fi

# Copy package.json from main project for reference
if [ -f "$PROJECT_ROOT/src/package.json" ]; then
    cp "$PROJECT_ROOT/src/package.json" "$ROO_CODE_DIR/package.json"
fi

# Create extension.package.json for RunVSAgent
echo "Creating extension.package.json..."
cat > "$ROO_CODE_DIR/extension.package.json" << 'EOF'
{
  "name": "roo-code",
  "displayName": "Roo Code",
  "description": "A whole dev team of AI agents in your editor",
  "publisher": "RooVeterinaryInc",
  "version": "3.28.0",
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

# Step 4: Build RunVSAgent extension host
echo -e "${YELLOW}📦 Step 4: Building RunVSAgent extension host...${NC}"
cd "$RUNVSAGENT_DIR/extension_host"

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing extension host dependencies..."
    npm install
fi

# Build the extension host
echo "Building extension host..."
npm run build

# Step 5: Build JetBrains plugin
echo -e "${YELLOW}📦 Step 5: Building JetBrains plugin...${NC}"
cd "$RUNVSAGENT_DIR/jetbrains_plugin"

# Build with Gradle
echo "Building JetBrains plugin with Gradle..."
./gradlew clean buildPlugin

# Step 6: Package everything
echo -e "${YELLOW}📦 Step 6: Creating final package...${NC}"

# Create output directory
OUTPUT_DIR="$SCRIPT_DIR/dist"
mkdir -p "$OUTPUT_DIR"

# Copy the built plugin
PLUGIN_FILE=$(find "$RUNVSAGENT_DIR/jetbrains_plugin/build/distributions" -name "*.zip" | head -1)
if [ -f "$PLUGIN_FILE" ]; then
    cp "$PLUGIN_FILE" "$OUTPUT_DIR/RunVSAgent-RooCode.zip"
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${GREEN}📦 Plugin package created at: $OUTPUT_DIR/RunVSAgent-RooCode.zip${NC}"
    echo ""
    echo "To install in JetBrains IDE:"
    echo "1. Open your JetBrains IDE (IntelliJ, WebStorm, PyCharm, etc.)"
    echo "2. Go to Settings/Preferences → Plugins"
    echo "3. Click the gear icon ⚙️ → Install Plugin from Disk..."
    echo "4. Select: $OUTPUT_DIR/RunVSAgent-RooCode.zip"
    echo "5. Restart your IDE"
else
    echo -e "${RED}❌ Error: Could not find built plugin file${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Build complete! Roo Code is ready for JetBrains IDEs!${NC}"