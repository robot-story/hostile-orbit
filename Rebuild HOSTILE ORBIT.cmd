@echo off
title HOSTILE ORBIT rebuild
cd /d "%~dp0"
echo Building the latest version of HOSTILE ORBIT (web build + desktop package)...
echo This takes one to three minutes. The window closes into the game when it is done.
call npm run package
if exist "release\win-unpacked\HOSTILE ORBIT.exe" ( echo Done. Launching. & start "" "release\win-unpacked\HOSTILE ORBIT.exe" ) else if exist "release\HostileOrbit.exe" ( echo Done. Launching. & start "" "release\HostileOrbit.exe" ) else ( echo Build failed. See the output above. & pause )
