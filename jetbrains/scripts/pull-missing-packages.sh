#!/bin/bash

# Base paths
KILOCODE_BASE="https://api.github.com/repos/Kilo-Org/kilocode/contents/jetbrains/plugin/src/main/kotlin/ai/kilocode/jetbrains"
LOCAL_BASE="jetbrains/plugin/src/main/kotlin/ai/roocode/jetbrains"

# Missing packages to pull
PACKAGES=(
    "commands"
    "core"
    "editor"
    "events"
    "i18n"
    "ipc"
    "model"
    "plugin"
    "service"
    "terminal"
    "theme"
    "ui"
    "util"
    "webview"
    "workspace"
)

# Function to download and process files from a package
download_package() {
    local package=$1
    echo "Processing package: $package"
    
    # Create local directory
    mkdir -p "$LOCAL_BASE/$package"
    
    # Get list of files in the package
    FILES=$(gh api "repos/Kilo-Org/kilocode/contents/jetbrains/plugin/src/main/kotlin/ai/kilocode/jetbrains/$package" --jq '.[].name' 2>/dev/null)
    
    if [ -z "$FILES" ]; then
        echo "  No files found or error accessing package $package"
        return
    fi
    
    # Download each file
    for file in $FILES; do
        if [[ $file == *.kt ]]; then
            echo "  Downloading: $file"
            
            # Get the file content
            gh api "repos/Kilo-Org/kilocode/contents/jetbrains/plugin/src/main/kotlin/ai/kilocode/jetbrains/$package/$file" \
                --jq '.content' | base64 -d > "$LOCAL_BASE/$package/$file"
            
            # Replace package names
            sed -i '' "s/ai\.kilocode/ai.roocode/g" "$LOCAL_BASE/$package/$file"
            sed -i '' "s/Kilocode/RooCode/g" "$LOCAL_BASE/$package/$file"
            sed -i '' "s/kilocode/roocode/g" "$LOCAL_BASE/$package/$file"
            sed -i '' "s/Kilo Code/Roo Code/g" "$LOCAL_BASE/$package/$file"
            sed -i '' "s/KILOCODE/ROOCODE/g" "$LOCAL_BASE/$package/$file"
        fi
    done
}

# Main execution
echo "Starting to pull missing Kotlin packages from Kilocode..."
echo "================================================"

for package in "${PACKAGES[@]}"; do
    download_package "$package"
    echo "------------------------------------------------"
done

echo "================================================"
echo "Finished pulling packages!"
echo ""
echo "Now fixing any remaining import issues..."

# Fix any remaining issues with hyphens in package names
find "$LOCAL_BASE" -name "*.kt" -exec sed -i '' 's/ai\.roo-code/ai.roocode/g' {} \;

echo "Done!"