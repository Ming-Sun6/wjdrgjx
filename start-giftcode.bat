@echo off
setlocal EnableExtensions

cd /d "%~dp0wjdr-giftcode"

REM Avoid multiple Flask instances on 5201 (old copies would shadow new routes)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

set "GIFTCODE_URL_PREFIX=/giftcode"
set "GIFTCODE_PORT=5201"

if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

echo.
echo ================================
echo  WJDR Giftcode (Flask) :%GIFTCODE_PORT%
echo  URL prefix: %GIFTCODE_URL_PREFIX%
echo ================================
echo.

python main.py
