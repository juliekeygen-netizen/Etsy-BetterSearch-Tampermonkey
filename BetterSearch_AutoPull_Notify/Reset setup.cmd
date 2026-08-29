@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0BetterSearch-AutoPull.config.json" del /q "%~dp0BetterSearch-AutoPull.config.json"
echo Saved setup removed.
echo.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0BetterSearch-AutoPull.ps1" -Setup
