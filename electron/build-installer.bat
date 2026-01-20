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
echo Building Windows installer...
echo This may take a few minutes...
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
