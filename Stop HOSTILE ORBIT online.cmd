@echo off
cd /d "%~dp0"
call powershell -NoProfile -File tools\stop-online.ps1
pause
