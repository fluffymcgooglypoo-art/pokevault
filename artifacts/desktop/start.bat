@echo off
title PokeVault
setlocal

cd /d "%~dp0..\.."
set "ROOT=%CD%"
set "ELECTRON_API_PORT=8082"

:: ── Check Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js is not installed.
    echo  Download it from: https://nodejs.org  (click the green LTS button)
    echo  After installing, run this file again.
    echo.
    pause
    exit /b 1
)

:: ── First-run setup ────────────────────────────────────────────────────────
:: Runs automatically the very first time (or if something is missing).

if not exist "node_modules" (
    echo  First-time setup: installing packages (may take a few minutes)...
    call pnpm install
    if errorlevel 1 ( echo  Install failed. & pause & exit /b 1 )
)

if not exist "artifacts\api-server\dist\index.mjs" (
    echo  Building API server...
    call pnpm --filter @workspace/api-server run build
    if errorlevel 1 ( echo  API build failed. & pause & exit /b 1 )
)

if not exist "artifacts\pokevault\dist\public\index.html" (
    echo  Building app interface...
    set BASE_PATH=/
    set PORT=3000
    set NODE_ENV=production
    call pnpm --filter @workspace/pokevault run build
    if errorlevel 1 ( echo  Frontend build failed. & pause & exit /b 1 )
)

if not exist "artifacts\desktop\dist\main.js" (
    echo  Building desktop launcher...
    call pnpm --filter @workspace/desktop run build
    if errorlevel 1 ( echo  Desktop build failed. & pause & exit /b 1 )
)

:: ── Launch ─────────────────────────────────────────────────────────────────
echo  Starting PokeVault...

set NODE_ENV=production
set ELECTRON_API_PORT=%ELECTRON_API_PORT%
set ELECTRON_USE_BUILT_RENDERER=1

cd "%ROOT%\artifacts\desktop"
start "" npx electron dist\main.js

exit /b 0
