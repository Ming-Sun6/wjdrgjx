@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ================================
echo  Restart WJDR server (production)
echo ================================
echo.

set "NODE_SERVICE=wjgl-node"
set "GC_SERVICE=wjgl-giftcode"

sc query "%NODE_SERVICE%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Service "%NODE_SERVICE%" not found. Install: npm run service:install
) else (
  echo [1/2] Restart %NODE_SERVICE% (port 3000, IIS -^> Node) ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%NODE_SERVICE%' -ErrorAction Stop"
  echo [OK] %NODE_SERVICE% restarted.
)

sc query "%GC_SERVICE%" >nul 2>&1
if errorlevel 1 (
  echo [2/2] Service %GC_SERVICE% not found. Starting giftcode manually ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode-min.bat"
  call :wait_port 5201 20
) else (
  echo [2/2] Restart %GC_SERVICE% (port 5201, giftcode Flask) ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%GC_SERVICE%' -ErrorAction Stop"
  echo [OK] %GC_SERVICE% restarted.
)

echo.
echo Site:    https://wjgl.store/  (or http://localhost:3000/)
echo Giftcode: https://wjgl.store/giftcode/
echo Health:  http://127.0.0.1:5201/api/giftcode/health
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
if %TRIES% LEQ 0 exit /b 1
timeout /t 1 /nobreak >nul
goto wait_port_loop
