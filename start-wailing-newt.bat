@echo off
:: Self-relaunch with cmd /k to keep window open
if "%~1"=="" (
    cmd /k "%~f0" run
    exit /b
)

echo ================================================================================
echo                     Wailing Newt Web Walker Launcher
echo ================================================================================
echo.

echo Checking for Docker...
docker --version 2>nul
if errorlevel 1 goto nodocker

echo Docker found! Starting Wailing Newt Web Walker...
docker-compose up -d
timeout /t 3 /nobreak >nul

echo.
echo ================================================================================
echo Wailing Newt Web Walker is running!
echo Opening browser to http://localhost:5000
echo.
echo Press Ctrl+C to stop, then type 'exit' to close this window.
echo ================================================================================
echo.

start http://localhost:5000
docker-compose logs -f
docker-compose down
goto :eof

:nodocker
echo Docker not found. Checking for Python...
python --version 2>nul
if errorlevel 1 goto trypy
set PYTHON=python
goto foundpython

:trypy
py --version 2>nul
if errorlevel 1 goto nopython
set PYTHON=py
goto foundpython

:foundpython
echo Python found: %PYTHON%
echo.
echo Installing/updating dependencies...
%PYTHON% -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install dependencies.
    echo Please check your Python installation and try again.
    goto :eof
)

echo.
echo Starting Wailing Newt Web Walker...
echo Press Ctrl+C to stop, then type 'exit' to close this window.
echo.
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"
%PYTHON% main.py -l
echo.
echo Server has stopped.
goto :eof

:nopython
echo.
echo ERROR: Neither Docker nor Python found!
echo.
echo Please install one of:
echo - Docker Desktop: https://www.docker.com/products/docker-desktop
echo - Python 3.11+: https://www.python.org/downloads/
goto :eof
