@echo off
setlocal EnableExtensions
cd /d "%~dp0" || exit /b 1

if not exist "logs" mkdir "logs" >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  echo [%date% %time%] Node.js not found>> "logs\giftcode.log"
  exit /b 1
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

echo.>> "logs\giftcode.log"
echo ===== giftcode start %date% %time% =====>> "logs\giftcode.log"

node "%~dp0scripts\giftcode-start-min.js"
exit /b %ERRORLEVEL%
