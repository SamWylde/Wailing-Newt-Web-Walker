@echo off
:: Wailing Newt Web Walker - Electron Launcher

:: Relaunch silently by default when double-clicked
if /i "%~1"=="" (
    wscript "%~dp0start-electron-silent.vbs"
    exit /b
)

set "LAUNCH_MODE=%~1"
set "RUN_SETUP=1"

if /i "%LAUNCH_MODE%"=="--silent" set "RUN_SETUP=auto"
if /i "%LAUNCH_MODE%"=="--console" set "RUN_SETUP=auto"
if /i "%LAUNCH_MODE%"=="--setup" set "RUN_SETUP=1"

if /i not "%LAUNCH_MODE%"=="--silent" (
    echo ================================================================================
    echo              Wailing Newt Web Walker - Electron Desktop App
    echo ================================================================================
    echo.
)

:: Kill any existing Python processes on port 5000 to avoid conflicts
if /i not "%LAUNCH_MODE%"=="--silent" echo Checking for existing processes on port 5000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    if /i not "%LAUNCH_MODE%"=="--silent" echo Killing process %%a on port 5000...
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
if /i "%RUN_SETUP%"=="1" (
    if /i not "%LAUNCH_MODE%"=="--silent" echo Checking for updates...
    cd ..
    git pull origin main --quiet 2>nul
    if errorlevel 1 (
        if /i not "%LAUNCH_MODE%"=="--silent" echo Note: Could not pull updates. Continuing with local version...
    )
    cd electron
)

:: Always install/update npm packages (ensures electron-updater is installed)
if /i "%RUN_SETUP%"=="1" (
    if /i not "%LAUNCH_MODE%"=="--silent" echo Installing/updating npm packages...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install npm packages
        pause
        exit /b 1
    )
) else (
    if not exist "node_modules" (
        if /i not "%LAUNCH_MODE%"=="--silent" echo Installing npm packages (first run)...
        call npm install
        if errorlevel 1 (
            echo ERROR: Failed to install npm packages
            pause
            exit /b 1
        )
    )
)

:: Check if Python dependencies are installed
if /i "%RUN_SETUP%"=="1" (
    if /i not "%LAUNCH_MODE%"=="--silent" echo Checking Python dependencies...
    cd ..
    python -m pip install -r requirements.txt --quiet 2>nul
    if errorlevel 1 (
        py -m pip install -r requirements.txt --quiet 2>nul
    )
    cd electron
)

if /i "%RUN_SETUP%"=="1" (
    :: Install Playwright browsers if needed
    cd ..
    python -m playwright install chromium --quiet 2>nul
    if errorlevel 1 (
        py -m playwright install chromium --quiet 2>nul
    )
    cd electron
)

if /i not "%LAUNCH_MODE%"=="--silent" (
    echo.
    echo Starting Wailing Newt Desktop App...
    echo.
)

:: Start Electron
if /i "%LAUNCH_MODE%"=="--console" (
    call npm start
    exit /b
)

if /i "%LAUNCH_MODE%"=="--silent" (
    call npm start
    exit /b
)

start "" /b cmd /c "npm start"
exit /b
