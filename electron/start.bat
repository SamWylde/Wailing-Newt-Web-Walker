@echo off
:: Wailing Newt Web Walker - Fast Launcher

:: Kill any existing processes on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING 2^>nul') do (
    taskkill /f /pid %%a >nul 2>&1
)

:: Launch Electron immediately (all setup happens in loading window)
start /min cmd /c "cd /d "%~dp0" && npm start"
