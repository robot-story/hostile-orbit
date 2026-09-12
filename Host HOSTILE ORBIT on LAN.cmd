@echo off
title HOSTILE ORBIT - LAN host
cd /d "%~dp0"
echo Building the latest web version...
call npm run build
if errorlevel 1 ( echo Build failed. See the output above. & pause & exit /b 1 )
echo.
echo Serving HOSTILE ORBIT. Open the Local URL here, give friends the Network URL to join your lobby.
echo Press Ctrl+C in this window to stop hosting.
echo.
start "" "http://localhost:4173/"
call npx vite preview --host --port 4173 --strictPort
pause
