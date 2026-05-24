@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ================================
echo  WJDR Toolbox + Giftcode Center
echo ================================
echo.

REM --- Giftcode Flask (5201) ---
call :port_listening 5201
if errorlevel 1 (
  echo [1/2] Starting giftcode Flask on port 5201 ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode-min.bat"
  call :wait_port 5201 25
  if errorlevel 1 (
    echo.
    echo [ERROR] Giftcode did not start on port 5201.
    echo         Double-click start-giftcode.bat to see the error.
    if exist "logs\giftcode.log" (
      echo.
      echo --- logs\giftcode.log (last 12 lines) ---
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

REM --- Node main site (3000) ---
call :port_listening 3000
if not errorlevel 1 (
  echo.
  echo [2/2] Port 3000 already in use (wjgl-node Windows service?).
  echo   Home:     http://localhost:3000/
  echo   Giftcode: http://localhost:3000/giftcode/
  echo.
  echo Do NOT start a second Node here. If the site fails, run restart-all.bat
  echo or: Restart-Service wjgl-node  then start-giftcode.bat
  echo.
  pause
  exit /b 0
)

echo [2/2] Starting Node site on port 3000 ...
echo   Home:     http://localhost:3000/
echo   Giftcode: http://localhost:3000/giftcode/
echo   Keep THIS window open. Ctrl+C to stop Node only.
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
if %TRIES% LEQ 0 exit /b 1
timeout /t 1 /nobreak >nul
goto wait_port_loop

:port_listening
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%
