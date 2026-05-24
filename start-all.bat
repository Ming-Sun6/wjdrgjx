@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ================================
echo  无尽冬日工具箱 + 兑换中心
echo ================================
echo.

call :port_listening 5201
if errorlevel 1 (
  echo [1/2] 启动兑换中心 Flask ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode.bat"
  timeout /t 3 /nobreak >nul
) else (
  echo [1/2] 兑换中心已在 5201 运行
)

echo [2/2] 启动 Node 主站 (3000) ...
echo  首页: http://localhost:3000/
echo  兑换: http://localhost:3000/giftcode/
echo.
node server.js
pause
exit /b 0

:port_listening
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%
