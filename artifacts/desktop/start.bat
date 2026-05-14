@echo off
title PokeVault
cd /d "%~dp0..\.."

:: Check that setup has been run
if not exist "artifacts\api-server\dist\index.mjs" (
    echo  Setup has not been run yet.
    echo  Please run artifacts\desktop\setup.bat first.
    echo.
    pause
    exit /b 1
)

if not exist "artifacts\desktop\dist\main.js" (
    echo  Desktop build is missing.
    echo  Please run artifacts\desktop\setup.bat first.
    echo.
    pause
    exit /b 1
)

:: Find a free port for the API (default 8082)
set ELECTRON_API_PORT=8082

echo  Starting PokeVault...

:: Start the API server in the background
start /B "" cmd /c "set PORT=%ELECTRON_API_PORT% && node --enable-source-maps artifacts\api-server\dist\index.mjs > artifacts\desktop\api.log 2>&1"

:: Give the API server a moment to start
timeout /t 2 /nobreak >nul

:: Launch Electron
set NODE_ENV=development
set ELECTRON_API_PORT=%ELECTRON_API_PORT%
cd artifacts\desktop
npx electron dist\main.js

:: When Electron closes, kill the background API server
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":%ELECTRON_API_PORT%"') do taskkill /PID %%p /F >nul 2>&1
