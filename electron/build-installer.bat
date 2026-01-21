@echo off
:: Wailing Newt Web Walker - Build Windows Installer

echo ================================================================================
echo              Wailing Newt Web Walker - Build Installer
echo ================================================================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

:: Install npm packages if needed
if not exist "node_modules" (
    echo Installing npm packages...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install npm packages
        pause
        exit /b 1
    )
)

echo.
echo Cleaning previous build artifacts...
:: Remove dist folder to ensure fresh build
if exist "dist" (
    rmdir /s /q "dist"
    echo   - Removed dist folder
)

:: Remove electron-builder cache to force fresh copy of files
if exist "%LOCALAPPDATA%\electron-builder\Cache" (
    echo   - Note: electron-builder cache exists at %LOCALAPPDATA%\electron-builder\Cache
    echo     Delete manually if you experience caching issues
)

:: Remove any unpacked folders
for /d %%i in ("dist\win-unpacked*") do (
    rmdir /s /q "%%i" 2>nul
)

echo.
echo Building Windows installer...
echo This may take a few minutes...
echo.
echo Source files being packaged:
echo   - electron\main.js, preload.js, updater.js, loading.html
echo   - main.py, requirements.txt
echo   - src\**\*
echo   - web\**\*
echo.

:: Build the installer
call npm run build:win

if errorlevel 1 (
    echo.
    echo ERROR: Build failed!
    pause
    exit /b 1
)

echo.
echo ================================================================================
echo Build complete! Installer is in the 'dist' folder.
echo ================================================================================
echo.

:: Open dist folder
explorer dist

pause
