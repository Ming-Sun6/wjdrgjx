@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "SERVICE_NAME=wjgl-node"
set "GC_SERVICE=wjgl-giftcode"
set "HEALTH_URL=http://127.0.0.1:3000/api/health"

:menu
echo.
echo ================================
echo  WJGL backend services
echo  Dir: %cd%
echo ================================
echo  1^) Install/start Node service (npm run service:install)
echo  2^) Start Node (wjgl-node)
echo  3^) Stop Node
echo  4^) Restart Node + start giftcode bat
echo  5^) Status
echo  6^) Open health check
echo  7^) Uninstall Node service
echo  8^) Install/start giftcode service (npm run service:giftcode:install)
echo  9^) Restart ALL (restart-all.bat)
echo  0^) Exit
echo.

set "choice="
set /p choice=Choose [0-9]: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto start
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto restart
if "%choice%"=="5" goto status
if "%choice%"=="6" goto health
if "%choice%"=="7" goto uninstall
if "%choice%"=="8" goto gc_install
if "%choice%"=="9" goto restart_all
if "%choice%"=="0" goto end

echo Invalid choice.
goto menu

:install
echo.
call npm run service:install
echo.
goto status

:uninstall
echo.
call npm run service:uninstall
echo.
goto status

:gc_install
echo.
call npm run service:giftcode:install
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name '%GC_SERVICE%' -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize"
echo.
pause
goto menu

:restart_all
call "%~dp0restart-all.bat"
goto menu

:start
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
echo Done.
goto status

:stop
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
echo Done.
goto status

:restart
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
start "wjdr-giftcode" /min "%~dp0start-giftcode-min.bat"
timeout /t 3 /nobreak >nul
goto status

:status
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name '%SERVICE_NAME%','%GC_SERVICE%' -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize"
echo.
pause
goto menu

:health
start "" "%HEALTH_URL%"
start "" "http://127.0.0.1:5201/api/giftcode/health"
pause
goto menu

:end
endlocal
exit /b 0
