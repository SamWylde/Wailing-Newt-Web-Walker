@echo off
:: Wailing Newt Web Walker - Electron Launcher

echo ================================================================================
echo              Wailing Newt Web Walker - Electron Desktop App
echo ================================================================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if npm packages are installed
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install npm packages
        pause
        exit /b 1
    )
)

:: Check if Python dependencies are installed
echo Checking Python dependencies...
cd ..
python -m pip install -r requirements.txt --quiet 2>nul
if errorlevel 1 (
    py -m pip install -r requirements.txt --quiet 2>nul
)

:: Install Playwright browsers if needed
python -m playwright install chromium --quiet 2>nul
if errorlevel 1 (
    py -m playwright install chromium --quiet 2>nul
)
cd electron

echo.
echo Starting Wailing Newt Desktop App...
echo.

:: Start Electron
call npm start
