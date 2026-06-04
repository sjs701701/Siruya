@echo off
setlocal

set "PROJECT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%scripts\start-android-dev.ps1"

echo.
echo Done. You can close this window after the app is running.
pause
