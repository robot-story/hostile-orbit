@echo off
cd /d "%~dp0"
call powershell -NoProfile -File tools\start-online.ps1
pause
