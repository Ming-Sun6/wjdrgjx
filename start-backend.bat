@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "SERVICE_NAME=wjgl-node"

echo.
echo ================================
echo  Start Node backend (port 3000)
echo  Dir: %cd%
echo ================================
echo.

sc query "%SERVICE_NAME%" >nul 2>&1
if %errorlevel%==0 (
  echo 检测到服务 %SERVICE_NAME%，尝试启动...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
  echo 服务启动命令已发送。
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name '%SERVICE_NAME%' | Select-Object Name,Status,StartType | Format-Table -AutoSize"
  echo.
  pause
  exit /b 0
)

echo 未检测到服务 %SERVICE_NAME%，改用 node 直接启动 server.js...
echo.

call :port_listening 5201
if errorlevel 1 (
  echo [START] Giftcode not on 5201, launching start-giftcode.bat ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode.bat"
  timeout /t 3 /nobreak >nul
) else (
  echo [SKIP] Giftcode already on port 5201
)

echo.
node server.js
echo.
pause
exit /b 0

:port_listening
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%

