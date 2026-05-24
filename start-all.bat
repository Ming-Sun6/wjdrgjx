@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || (echo [ERROR] Cannot cd to script folder. & pause & exit /b 1)

echo.
echo ================================
echo  WJDR Toolbox + Giftcode Center
echo ================================
echo.

call :port_listening 5201
if errorlevel 1 (
  echo [1/2] Starting giftcode Flask on port 5201 ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode-min.bat"
  call :wait_port 5201 30
  if errorlevel 1 (
    echo.
    echo [ERROR] Giftcode did not start on port 5201 within 30s.
    echo         Double-click start-giftcode.bat to see the error.
    if exist "logs\giftcode.log" (
      echo.
      echo === giftcode.log last 12 lines ===
      powershell -NoProfile -Command "Get-Content 'logs\giftcode.log' -Tail 12 -ErrorAction SilentlyContinue"
    )
    echo.
    pause
    exit /b 1
  )
  echo [OK] Giftcode is ready on port 5201.
) else (
  echo [1/2] Giftcode already running on port 5201
)

call :port_listening 3000
if not errorlevel 1 (
  echo.
  echo [2/2] Port 3000 already in use - wjgl-node service may be running.
  echo   Home:     http://localhost:3000/
  echo   Giftcode: http://localhost:3000/giftcode/
  echo.
  echo No second Node needed. To restart both: restart-all.bat
  echo.
  pause
  exit /b 0
)

where node >nul 2>&1 || (echo [ERROR] Node.js not found in PATH. & pause & exit /b 1)

echo [2/2] Starting Node site on port 3000 ...
echo   Home:     http://localhost:3000/
echo   Giftcode: http://localhost:3000/giftcode/
echo   Keep THIS window open. Ctrl+C to stop Node.
echo.

node server.js

echo.
echo Node stopped.
pause
exit /b 0

:wait_port
set "WP=%~1"
set /a "TRIES=%~2"
:wait_port_loop
call :port_listening %WP%
if not errorlevel 1 exit /b 0
set /a TRIES-=1
if !TRIES! LSS 1 exit /b 1
timeout /t 1 /nobreak >nul
goto wait_port_loop

:port_listening
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%
