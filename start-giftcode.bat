@echo off
setlocal EnableExtensions

cd /d "%~dp0" || (echo [ERROR] Cannot cd to project folder. & pause & exit /b 1)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  echo Port 5201 already in use by PID %%a
  echo Stop it first or run restart-all.bat
  pause
  exit /b 1
)

where node >nul 2>&1 || (
  echo [ERROR] Node.js not found. Install Node or run start-all.bat after installing Node.
  pause
  exit /b 1
)

echo.
echo ================================
echo  WJDR Giftcode Flask port 5201
echo  Launcher: Node scripts/giftcode-start-min.js
echo  Keep THIS window open.
echo ================================
echo.

if not exist "logs" mkdir "logs" >nul 2>&1
node "%~dp0scripts\giftcode-start-min.js"
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo [ERROR] Giftcode exited with code %EC%
  echo See logs\giftcode.log
  pause
)
exit /b %EC%
