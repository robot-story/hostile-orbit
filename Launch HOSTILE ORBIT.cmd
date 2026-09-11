@echo off
title HOSTILE ORBIT launcher
cd /d "%~dp0"
if exist "release\HostileOrbit.exe" ( start "" "release\HostileOrbit.exe" ) else ( echo Building the desktop build first... && call npm run package && start "" "release\HostileOrbit.exe" )
