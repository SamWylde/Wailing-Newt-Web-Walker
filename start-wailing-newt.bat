@echo off

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
echo Press Ctrl+C to stop Wailing Newt Web Walker
echo DO NOT close this window or it will keep running!
echo ================================================================================
echo.

start http://localhost:5000
docker-compose logs -f
docker-compose down
exit /b

:nodocker
echo Docker not found. Checking for Python...
python --version 2>nul
if errorlevel 1 goto trypy

:foundpython
echo Python found! Installing/updating dependencies...
python -m pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo Failed to install dependencies. Please check your Python installation.
    pause
    exit /b 1
)

:rundirect
echo Starting Wailing Newt Web Walker...
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5000"
python main.py -l
exit /b

:trypy
py --version 2>nul
if errorlevel 1 goto nopython
set PYTHON=py
goto foundpython

:nopython
echo.
echo ERROR: Neither Docker nor Python found!
echo.
echo Please install one of:
echo - Docker Desktop: https://www.docker.com/products/docker-desktop
echo - Python 3.11+: https://www.python.org/downloads/
echo.
pause
exit /b 1
