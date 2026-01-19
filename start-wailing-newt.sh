#!/bin/bash

# Start Wailing Newt Web Walker - tries Docker first, falls back to Python

echo "Checking for Docker..."
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
    echo "Docker found! Starting Wailing Newt Web Walker with Docker..."
    docker-compose up -d

    # Wait for the service to be ready
    echo "Waiting for Wailing Newt Web Walker to start..."
    sleep 3

    # Check if container is running
    if docker ps | grep -q wailing-newt; then
        echo ""
        echo "================================================================================"
        echo "Wailing Newt Web Walker is running!"
        echo "Opening browser to http://localhost:5000"
        echo ""
        echo "Press Ctrl+C to stop Wailing Newt Web Walker and exit"
        echo "DO NOT close this terminal or it will keep running in the background!"
        echo "================================================================================"
        echo ""

        # Detect OS and open browser
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            xdg-open http://localhost:5000 2>/dev/null || sensible-browser http://localhost:5000
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            open http://localhost:5000
        else
            echo "Please open http://localhost:5000 in your browser"
        fi

        # Trap Ctrl+C to gracefully shutdown
        trap 'echo ""; echo "Stopping Wailing Newt Web Walker..."; docker-compose down; exit 0' INT

        # Keep terminal open and show logs
        echo "Showing live logs (press Ctrl+C to stop):"
        echo ""
        docker-compose logs -f
    else
        echo "Error: Wailing Newt Web Walker container failed to start"
        docker-compose logs
        exit 1
    fi
else
    echo "Docker not found. Checking for Python..."

    # Check for Python 3
    if ! command -v python3 &> /dev/null; then
        echo "Python 3 not found! Please install Python 3.11 or later."
        echo ""
        echo "Installation instructions:"
        echo "  Ubuntu/Debian: sudo apt install python3 python3-pip"
        echo "  macOS: brew install python@3.11"
        echo "  Or download from: https://www.python.org/downloads/"
        exit 1
    fi

    echo "Python found! Installing dependencies..."

    # Check if pip is available
    if ! command -v pip3 &> /dev/null; then
        echo "pip not found! Installing pip..."
        python3 -m ensurepip --default-pip
    fi

    # Check if Flask is installed
    if ! python3 -c "import flask" &> /dev/null; then
        echo "Installing Python packages from requirements.txt..."
        pip3 install -r requirements.txt

        if [ $? -ne 0 ]; then
            echo "Failed to install dependencies!"
            exit 1
        fi

        echo "Installing Playwright browsers..."
        playwright install chromium
    fi

    # Run Wailing Newt Web Walker with Python in local mode
    echo "Starting Wailing Newt Web Walker in local mode..."
    echo "Opening browser to http://localhost:5000"

    # Open browser after 2 seconds (give Flask time to start)
    (sleep 2 && {
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            xdg-open http://localhost:5000 2>/dev/null || sensible-browser http://localhost:5000
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            open http://localhost:5000
        fi
    }) &

    # Run main.py with local flag
    python3 main.py -l
fi
