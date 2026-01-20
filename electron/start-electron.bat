@echo off
:: Wailing Newt Web Walker - Electron Launcher

:: Minimize this console window
if not "%minimized%"=="" goto :minimized
set minimized=true
start /min cmd /C "%~dpnx0"
exit
:minimized

echo ================================================================================
echo              Wailing Newt Web Walker - Electron Desktop App
echo ================================================================================
echo.

:: Kill any existing Python processes on port 5000 to avoid conflicts
echo Checking for existing processes on port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Killing process %%a on port 5000...
    taskkill /f /pid %%a >nul 2>&1
)

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Pull latest updates from git (if git is available)
echo Checking for updates...
cd ..
git pull origin main --quiet 2>nul
if errorlevel 1 (
    echo Note: Could not pull updates. Continuing with local version...
)
cd electron

:: Always install/update npm packages (ensures electron-updater is installed)
echo Installing/updating npm packages...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install npm packages
    pause
    exit /b 1
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
