@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || (echo [ERROR] Cannot cd to script folder. & pause & exit /b 1)

echo.
echo ================================
echo  Restart WJDR server
echo ================================
echo.

set "NODE_SERVICE=wjgl-node"
set "GC_SERVICE=wjgl-giftcode"

sc query "%NODE_SERVICE%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Service %NODE_SERVICE% not found. Run: npm run service:install
) else (
  echo [1/2] Restart %NODE_SERVICE% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%NODE_SERVICE%' -ErrorAction Stop"
  if errorlevel 1 (
    echo [ERROR] Restart failed. Run this bat as Administrator.
    pause
    exit /b 1
  )
  echo [OK] %NODE_SERVICE% restarted.
)

sc query "%GC_SERVICE%" >nul 2>&1
if errorlevel 1 (
  echo [2/2] %GC_SERVICE% not installed. Starting giftcode manually ...
  start "wjdr-giftcode" "%~dp0start-giftcode.bat"
  call :wait_port 5201 30
) else (
  echo [2/2] Restart %GC_SERVICE% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%GC_SERVICE%' -ErrorAction Stop"
  echo [OK] %GC_SERVICE% restarted.
)

echo.
echo Home:     http://localhost:3000/
echo Giftcode: http://localhost:3000/giftcode/
echo.
pause
exit /b 0

:wait_port
set "WP=%~1"
set /a "TRIES=%~2"
:wait_port_loop
netstat -ano | findstr /R /C:":%WP% .*LISTENING" >nul 2>&1
if not errorlevel 1 exit /b 0
set /a TRIES-=1
if !TRIES! LSS 1 exit /b 1
timeout /t 1 /nobreak >nul
goto wait_port_loop
