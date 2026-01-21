@echo off
setlocal

:: Self-relaunch with cmd /k to keep window open (skip for silent launches)
if "%~1"=="" (
    cmd /k "%~f0" run
    exit /b
)

if /i "%~1"=="--silent" set SILENT=1

if not defined SILENT (
    echo ================================================================================
    echo                     Wailing Newt Web Walker Launcher
    echo ================================================================================
    echo.
)

set ELECTRON_DIR=%~dp0electron
if exist "%ELECTRON_DIR%\start-electron.bat" (
    if not defined SILENT echo Checking for Electron app...
    node --version >nul 2>&1
    if not errorlevel 1 (
        if not defined SILENT echo Electron prerequisites found. Starting desktop app...
        pushd "%ELECTRON_DIR%"
        call start-electron.bat
        popd
        goto :eof
    ) else (
        if not defined SILENT echo Node.js not found. Falling back to Python...
    )
)

if not defined SILENT echo Checking for Python...
python --version 2>nul
if errorlevel 1 goto trypy
set PYTHON=python
goto foundpython

:trypy
py --version 2>nul
if errorlevel 1 goto nodocker
set PYTHON=py
goto foundpython

:foundpython
if not defined SILENT echo Python found: %PYTHON%
if not defined SILENT echo.
if not defined SILENT echo Installing/updating dependencies...
%PYTHON% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    if not defined SILENT echo.
    if not defined SILENT echo ERROR: Failed to install dependencies.
    if not defined SILENT echo Please check your Python installation and try again.
    goto :eof
)

if not defined SILENT echo Installing Playwright browsers (first run only)...
%PYTHON% -m playwright install chromium --quiet 2>nul
if errorlevel 1 (
    if not defined SILENT echo Playwright browser installation required...
    %PYTHON% -m playwright install chromium
)

if not defined SILENT echo.
if not defined SILENT echo Starting Wailing Newt Web Walker...
if not defined SILENT echo Press Ctrl+C to stop, then type 'exit' to close this window.
if not defined SILENT echo.
%PYTHON% main.py -l
if not defined SILENT echo.
if not defined SILENT echo Server has stopped.
goto :eof

:nodocker
if not defined SILENT echo Docker not found. Checking for Docker fallback...
docker info >nul 2>&1
if errorlevel 1 goto nopython

if not defined SILENT echo Docker found! Starting Wailing Newt Web Walker...
docker-compose up -d
timeout /t 3 /nobreak >nul

if not defined SILENT echo.
if not defined SILENT echo ================================================================================
if not defined SILENT echo Wailing Newt Web Walker is running!
if not defined SILENT echo Opening browser to http://localhost:5000
if not defined SILENT echo.
if not defined SILENT echo Press Ctrl+C to stop, then type 'exit' to close this window.
if not defined SILENT echo ================================================================================
if not defined SILENT echo.

start http://localhost:5000
docker-compose logs -f
docker-compose down
goto :eof

:nopython
if not defined SILENT echo.
if not defined SILENT echo ERROR: Electron, Python, and Docker are not available!
if not defined SILENT echo.
if not defined SILENT echo Please install one of:
if not defined SILENT echo - Node.js (for Electron): https://nodejs.org/
if not defined SILENT echo - Python 3.11+: https://www.python.org/downloads/
if not defined SILENT echo - Docker Desktop: https://www.docker.com/products/docker-desktop
goto :eof
