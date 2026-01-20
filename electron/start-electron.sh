#!/bin/bash
# Wailing Newt Web Walker - Electron Launcher

echo "================================================================================"
echo "              Wailing Newt Web Walker - Electron Desktop App"
echo "================================================================================"
echo ""

# Kill any existing Python processes on port 5000 to avoid conflicts
echo "Checking for existing processes on port 5000..."
if command -v lsof &> /dev/null; then
    lsof -ti:5000 | xargs kill -9 2>/dev/null || true
elif command -v fuser &> /dev/null; then
    fuser -k 5000/tcp 2>/dev/null || true
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo "Please install Node.js from: https://nodejs.org/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Pull latest updates from git (if git is available)
echo "Checking for updates..."
cd "$SCRIPT_DIR/.."
git pull origin main --quiet 2>/dev/null || echo "Note: Could not pull updates. Continuing with local version..."
cd "$SCRIPT_DIR"

# Always install/update npm packages (ensures electron-updater is installed)
echo "Installing/updating npm packages..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install npm packages"
    read -p "Press Enter to exit..."
    exit 1
fi

# Find Python executable
PYTHON_CMD=""
for cmd in python3 python; do
    if command -v $cmd &> /dev/null; then
        PYTHON_CMD=$cmd
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo "ERROR: Python not found!"
    echo "Please install Python 3.11 or later"
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if Python dependencies are installed
echo "Checking Python dependencies..."
cd "$SCRIPT_DIR/.."
$PYTHON_CMD -m pip install -r requirements.txt --quiet 2>/dev/null || true

# Install Playwright browsers if needed
echo "Installing Playwright browsers..."
$PYTHON_CMD -m playwright install chromium --quiet 2>/dev/null || true
cd "$SCRIPT_DIR"

echo ""
echo "Starting Wailing Newt Desktop App..."
echo ""

# Start Electron
npm start
