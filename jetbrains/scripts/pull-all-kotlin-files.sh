#!/bin/bash

# Base paths
KILOCODE_BASE="https://api.github.com/repos/Kilo-Org/kilocode"
LOCAL_BASE="jetbrains/plugin/src/main/kotlin/ai/roocode/jetbrains"

# Function to recursively download all files from a directory
download_directory() {
    local remote_path=$1
    local local_path=$2
    
    echo "Processing directory: $remote_path"
    
    # Create local directory
    /bin/mkdir -p "$local_path"
    
    # Get contents of the directory
    CONTENTS=$(gh api "repos/Kilo-Org/kilocode/contents/$remote_path" 2>/dev/null)
    
    if [ -z "$CONTENTS" ]; then
        echo "  No contents found or error accessing $remote_path"
        return
    fi
    
    # Process each item
    echo "$CONTENTS" | /usr/bin/jq -r '.[] | @base64' | while read -r item; do
        # Decode the item
        NAME=$(echo "$item" | /usr/bin/base64 -d | /usr/bin/jq -r '.name')
        TYPE=$(echo "$item" | /usr/bin/base64 -d | /usr/bin/jq -r '.type')
        PATH=$(echo "$item" | /usr/bin/base64 -d | /usr/bin/jq -r '.path')
        
        if [ "$TYPE" = "file" ] && [[ $NAME == *.kt ]]; then
            echo "  Downloading file: $NAME"
            
            # Get the file content
            gh api "repos/Kilo-Org/kilocode/contents/$PATH" \
                --jq '.content' | /usr/bin/base64 -d > "$local_path/$NAME"
            
            # Replace package names
            /usr/bin/sed -i '' "s/ai\.kilocode/ai.roocode/g" "$local_path/$NAME"
            /usr/bin/sed -i '' "s/Kilocode/RooCode/g" "$local_path/$NAME"
            /usr/bin/sed -i '' "s/kilocode/roocode/g" "$local_path/$NAME"
            /usr/bin/sed -i '' "s/Kilo Code/Roo Code/g" "$local_path/$NAME"
            /usr/bin/sed -i '' "s/KILOCODE/ROOCODE/g" "$local_path/$NAME"
            /usr/bin/sed -i '' "s/ai\.roo-code/ai.roocode/g" "$local_path/$NAME"
            
        elif [ "$TYPE" = "dir" ]; then
            echo "  Found subdirectory: $NAME"
            # Recursively process subdirectory
            download_directory "$PATH" "$local_path/$NAME"
        fi
    done
}

# Main execution
echo "Starting to pull ALL Kotlin files from Kilocode JetBrains plugin..."
echo "================================================================"

# Start the recursive download from the root JetBrains Kotlin source directory
download_directory "jetbrains/plugin/src/main/kotlin/ai/kilocode/jetbrains" "$LOCAL_BASE"

echo "================================================================"
echo "Finished pulling all Kotlin files!"
echo ""
echo "Final cleanup - fixing any remaining import issues..."

# Final cleanup
/usr/bin/find "$LOCAL_BASE" -name "*.kt" -exec /usr/bin/sed -i '' 's/ai\.roo-code/ai.roocode/g' {} \;

echo "Done!"