@echo off
:: Wailing Newt Web Walker - First-Time Setup
:: Run this once to install all dependencies

echo ================================================================================
echo            Wailing Newt Web Walker - First-Time Setup
echo ================================================================================
echo.
echo This will install all required dependencies.
echo You only need to run this once (or after updates).
echo.
pause

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    py --version >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python is not installed!
        echo Please install Python 3.11 or later from: https://www.python.org/
        echo.
        pause
        exit /b 1
    )
)

echo [1/4] Installing Node.js packages...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install npm packages
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Python dependencies...
cd ..
python -m pip install -r requirements.txt
if errorlevel 1 (
    py -m pip install -r requirements.txt
    if errorlevel 1 (
        echo WARNING: Could not install Python dependencies
        echo You may need to install them manually
    )
)

echo.
echo [3/4] Installing Playwright browsers...
python -m playwright install chromium --with-deps
if errorlevel 1 (
    py -m playwright install chromium --with-deps
    if errorlevel 1 (
        echo WARNING: Could not install Playwright browsers
        echo You may need to install them manually
    )
)
cd electron

echo.
echo [4/4] Setup complete!
echo.
echo ================================================================================
echo You can now launch Wailing Newt using one of these methods:
echo.
echo   1. start.bat              (Fast launcher - minimized CMD)
echo   2. start-silent.vbs       (Silent launcher - no CMD window)
echo   3. npm start              (Developer mode - full console output)
echo.
echo ================================================================================
echo.
pause
