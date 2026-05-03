@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "SERVICE_NAME=wjgl-node"
set "HEALTH_URL=http://127.0.0.1:3000/api/health"

:menu
echo.
echo ================================
echo  WJGL 后端服务管理
echo  目录: %cd%
echo  服务: %SERVICE_NAME%
echo ================================
echo  1^) 安装/更新并启动服务（npm run service:install）
echo  2^) 启动服务
echo  3^) 停止服务
echo  4^) 重启服务
echo  5^) 查看服务状态
echo  6^) 打开健康检查（浏览器）
echo  7^) 卸载服务（npm run service:uninstall）
echo  0^) 退出
echo.

set "choice="
set /p choice=请选择 [0-7]: 

if "%choice%"=="1" goto install
if "%choice%"=="2" goto start
if "%choice%"=="3" goto stop
if "%choice%"=="4" goto restart
if "%choice%"=="5" goto status
if "%choice%"=="6" goto health
if "%choice%"=="7" goto uninstall
if "%choice%"=="0" goto end

echo 输入无效，请重试。
goto menu

:install
echo.
echo [安装] 将通过 npm 安装并注册为 Windows 服务...
call npm run service:install
echo.
goto status

:uninstall
echo.
echo [卸载] 将卸载 Windows 服务...
call npm run service:uninstall
echo.
goto status

:start
echo.
echo [启动] 正在启动服务...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
echo 已发送启动命令。
goto status

:stop
echo.
echo [停止] 正在停止服务...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Stop-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
echo 已发送停止命令。
goto status

:restart
echo.
echo [重启] 正在重启服务...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Restart-Service -Name '%SERVICE_NAME%' -ErrorAction Stop"
echo 已发送重启命令。
goto status

:status
echo.
echo [状态] 当前服务状态：
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Service -Name '%SERVICE_NAME%' -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType | Format-Table -AutoSize"
echo.
pause
goto menu

:health
echo.
echo [健康检查] 打开 %HEALTH_URL%
start "" "%HEALTH_URL%"
echo.
pause
goto menu

:end
endlocal
exit /b 0

