@echo off
REM Run on SERVER after git pull (Administrator recommended)
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo === WJGL server restart after deploy ===
echo.

REM Node main site - service name is wjgl-node (process may show as wjglnode.exe)
set "NODE_SVC=wjgl-node"
set "GC_SVC=wjgl-giftcode"

sc query "%NODE_SVC%" >nul 2>&1
if errorlevel 1 (
  echo [WARN] Service %NODE_SVC% not found.
  echo        If you used another name, run: Get-Service *wjgl*
) else (
  echo [1/2] Restart %NODE_SVC% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%NODE_SVC%' -ErrorAction Stop"
  echo [OK] Main site Node restarted.
)

sc query "%GC_SVC%" >nul 2>&1
if errorlevel 1 (
  echo [2/2] %GC_SVC% not installed yet.
  echo       First time: install Python, then run:
  echo         npm run service:giftcode:install
  echo       Or manually: start-giftcode.bat
) else (
  echo [2/2] Restart %GC_SVC% ...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%GC_SVC%' -ErrorAction Stop"
  echo [OK] Giftcode Flask restarted.
)

echo.
echo Site:     https://wjgl.store/
echo Giftcode: https://wjgl.store/giftcode/
echo.
pause
