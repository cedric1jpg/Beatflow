@echo off
title Beatflow Launcher
cd /d "%~dp0"

echo Starting Beatflow...

:: Kill any process on port 3000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do (
  taskkill /f /pid %%a >nul 2>&1
)

:: Start server in background
start /b node server/index.js

:: Wait for server to be ready
:WAIT
timeout /t 1 /nobreak >nul
curl -s http://localhost:3000/health >nul 2>&1
if errorlevel 1 goto WAIT

:: Open in default browser
start http://localhost:3000

echo Beatflow is running. Close this window to stop.
pause
