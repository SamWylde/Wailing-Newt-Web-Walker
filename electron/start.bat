@echo off
:: Wailing Newt Web Walker - Fast Launcher (silent)

:: Kill any existing processes on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Launch Electron without keeping a console window open
set scriptDir=%~dp0
start "" /b wscript "%scriptDir%start-electron-silent.vbs"
exit /b
