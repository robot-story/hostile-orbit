@echo off
title HOSTILE ORBIT rebuild
cd /d "%~dp0"
echo Building the latest version into release\HostileOrbit.exe ...
call npm run package
if exist "release\HostileOrbit.exe" ( echo Done. Launching. && start "" "release\HostileOrbit.exe" ) else ( echo Build failed. See output above. && pause )
