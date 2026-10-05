@echo off
title Backup School Fee Manager
cd /d "%~dp0backend"
call node scripts\backup.js
if errorlevel 1 (
  echo.
  echo The backup FAILED. Is the internet working?
  pause
  exit /b 1
)
echo.
echo Backup finished. Opening the backups folder.
start "" "backups"
pause