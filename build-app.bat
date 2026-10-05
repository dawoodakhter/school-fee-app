@echo off
title Build School Fee Manager
cd /d "%~dp0"
echo Building the app. This takes a few minutes, please wait.
call npm run build
if errorlevel 1 (
  echo.
  echo The build FAILED.
  pause
  exit /b 1
)
echo.
echo Done. The app is up to date. Double-click start-app.bat to use it.
pause