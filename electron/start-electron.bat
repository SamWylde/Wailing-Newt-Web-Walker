@echo off
:: Wailing Newt Web Walker - Electron Launcher

:: Minimize this console window
if not "%minimized%"=="" goto :minimized
set minimized=true
start /min cmd /C "%~dpnx0"
exit
:minimized

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

:: Find a console Python command for setup tasks
set "PYTHON_CONSOLE="
python --version >nul 2>&1
if not errorlevel 1 set "PYTHON_CONSOLE=python"
if not defined PYTHON_CONSOLE (
    py -3.11 --version >nul 2>&1
    if not errorlevel 1 set "PYTHON_CONSOLE=py -3.11"
)
if not defined PYTHON_CONSOLE (
    py --version >nul 2>&1
    if not errorlevel 1 set "PYTHON_CONSOLE=py"
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
    if not defined PYTHON_CONSOLE (
        echo ERROR: Python console command not found for setup tasks.
        echo Please install Python 3.11 or set WNW_PYTHON_CONSOLE.
        pause
        exit /b 1
    )
    if /i not "%LAUNCH_MODE%"=="--silent" echo Checking Python dependencies with %PYTHON_CONSOLE%...
    cd ..
    %PYTHON_CONSOLE% -m pip install -r requirements.txt --quiet
    if errorlevel 1 (
        echo ERROR: Failed to install Python dependencies.
        pause
        exit /b 1
    )
    %PYTHON_CONSOLE% -c "import importlib.util,sys;mods=['crawl4ai','patchright','flask','waitress'];missing=[m for m in mods if importlib.util.find_spec(m) is None];print('Missing modules: ' + ', '.join(missing)) if missing else None;sys.exit(1 if missing else 0)"
    if errorlevel 1 (
        echo ERROR: Required Python modules are missing after install.
        echo Run: %PYTHON_CONSOLE% -m pip install -r requirements.txt
        pause
        exit /b 1
    )
    cd electron
)

if /i "%RUN_SETUP%"=="1" (
    :: Install browser runtime for Crawl4AI/Patchright if needed
    cd ..
    %PYTHON_CONSOLE% -m patchright install chromium --quiet 2>nul
    if errorlevel 1 (
        %PYTHON_CONSOLE% -m patchright install chromium 2>nul
        if errorlevel 1 (
            %PYTHON_CONSOLE% -m playwright install chromium --quiet 2>nul
        )
    )
    cd electron
)

if /i not "%LAUNCH_MODE%"=="--silent" (
    echo.
    echo Starting Wailing Newt Desktop App...
    echo.
)

:: Start Electron
call npm start
