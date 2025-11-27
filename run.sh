#!/bin/bash

# Spec Driven Development - Automated Setup and Installation Script
# This script automates Steps 0-3 from the README.md

set -e  # Exit on any error

echo "========================================"
echo "Spec Driven Development - Setup Script"
echo "========================================"
echo ""

# Step 0: AWS Connection (Manual - requires user interaction)
echo "📋 Step 0: AWS Connection"
echo "----------------------------------------"
echo "Please connect to AWS Development Account manually:"
echo ""
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "Run: duo-sso -session-duration 3600"
else
    echo "Run: .\\duo-sso_windows_amd64 -duo-idp -session-duration 3600 -factor push"
fi
echo ""
echo "Then select the '532054877749' account with 'developer' role."
echo ""
read -p "Press Enter once AWS connection is complete..."
echo ""

# Step 1: Install dependencies
echo "📦 Step 1: Installing dependencies..."
echo "----------------------------------------"
npm install
echo "✅ Dependencies installed successfully!"
echo ""

# Step 2: Verify LICENSE file exists
echo "📄 Step 2: Verifying LICENSE file..."
echo "----------------------------------------"
if [ ! -f "LICENSE" ]; then
    echo "⚠️  Warning: LICENSE file not found. Creating MIT License..."
    cat > LICENSE << 'EOF'
MIT License

Copyright (c) 2025 Cisco Systems, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF
    echo "✅ LICENSE file created"
else
    echo "✅ LICENSE file found"
fi
echo ""

# Step 3: Compile the extension
echo "🔨 Step 3: Compiling the extension..."
echo "----------------------------------------"
npm run compile
echo "✅ Extension compiled successfully!"
echo ""

# Step 4: Package and install the extension
echo "📦 Step 4: Packaging and installing extension..."
echo "----------------------------------------"
npm run package

# Find the generated .vsix file
VSIX_FILE=$(ls -t spec-driven-development-*.vsix 2>/dev/null | head -n 1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ Error: Could not find .vsix file"
    exit 1
fi

echo "Installing extension: $VSIX_FILE"
code --install-extension "$VSIX_FILE"
echo "✅ Extension installed successfully!"
echo ""

# Reload VS Code window
echo "🔄 Reloading VS Code window..."
echo "----------------------------------------"
echo "Please reload VS Code manually using one of these methods:"
echo "  1. Press Ctrl+Shift+P (or Cmd+Shift+P on Mac)"
echo "  2. Select 'Developer: Reload Window'"
echo ""
echo "Or close and reopen VS Code."
echo ""

echo "========================================"
echo "✅ Setup Complete!"
echo "========================================"
echo ""
echo "The extension has been installed successfully."
echo "Remember to reload VS Code to activate the extension."
