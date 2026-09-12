@echo off
title HOSTILE ORBIT launcher
cd /d "%~dp0"
rem Fast path: the unpacked build starts instantly (the portable exe unpacks itself to TEMP first).
if exist "release\win-unpacked\HOSTILE ORBIT.exe" ( start "" "release\win-unpacked\HOSTILE ORBIT.exe" & exit /b )
if exist "release\HostileOrbit.exe" ( start "" "release\HostileOrbit.exe" & exit /b )
echo No desktop build found yet. Building the latest version first (takes a minute or two)...
call npm run package
if exist "release\win-unpacked\HOSTILE ORBIT.exe" ( start "" "release\win-unpacked\HOSTILE ORBIT.exe" ) else if exist "release\HostileOrbit.exe" ( start "" "release\HostileOrbit.exe" ) else ( echo Build failed. See the output above. & pause )
