@echo off
title School Fee Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed on this computer.
  echo Install it from https://nodejs.org - choose the LTS version - then double-click this file again.
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo The file backend\.env is missing.
  echo It holds the database address and the secret key.
  echo Copy it from the computer where you built the app.
  pause
  exit /b 1
)

if not exist "frontend\dist\index.html" (
  echo First time only: building the app. This takes a few minutes, please wait.
  call npm run build
  if errorlevel 1 (
    echo.
    echo The build failed. Take a photo of this window and ask for help.
    pause
    exit /b 1
  )
)

rem From here on everything runs inside the backend folder, where the .env file is.
cd backend

echo Saving a backup of your data first.
call node scripts\backup.js
if errorlevel 1 (
  echo.
  echo The backup could not be made. Is the internet working?
  echo Press any key to start the app anyway.
  pause >nul
)

echo.
echo Starting the app. A second window opens - keep it open while you work.
start "School Fee Manager - keep this window open" cmd /k "node server.js"
timeout /t 5 /nobreak >nul
start "" http://localhost:5000
exit