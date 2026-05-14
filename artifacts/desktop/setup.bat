@echo off
title PokeVault — First-Time Setup
echo.
echo  ============================================================
echo   PokeVault Desktop — First-Time Setup
echo  ============================================================
echo.

:: Check Node.js
where node >nul 2>&1
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo.
    echo  Please download and install it from:
    echo    https://nodejs.org
    echo.
    echo  Choose the "LTS" version, install it, then run this
    echo  setup file again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  Node.js found: %NODE_VER%
echo.

:: Check pnpm
where pnpm >nul 2>&1
if errorlevel 1 (
    echo  Installing pnpm package manager...
    npm install -g pnpm
    if errorlevel 1 (
        echo  [ERROR] Could not install pnpm. Try running this file as Administrator.
        pause
        exit /b 1
    )
)
echo  pnpm found.
echo.

:: Go to the project root (two levels up from artifacts\desktop)
cd /d "%~dp0..\.."

echo  Installing dependencies (this may take a few minutes)...
call pnpm install
if errorlevel 1 (
    echo  [ERROR] Dependency installation failed.
    pause
    exit /b 1
)
echo.

echo  Building API server...
call pnpm --filter @workspace/api-server run build
if errorlevel 1 (
    echo  [ERROR] API server build failed.
    pause
    exit /b 1
)
echo.

echo  Building desktop launcher...
call pnpm --filter @workspace/desktop run build
if errorlevel 1 (
    echo  [ERROR] Desktop build failed.
    pause
    exit /b 1
)
echo.

echo  ============================================================
echo   Setup complete!
echo.
echo   To launch PokeVault, double-click:
echo     artifacts\desktop\start.bat
echo  ============================================================
echo.
pause
