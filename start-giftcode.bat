@echo off
setlocal EnableExtensions

cd /d "%~dp0wjdr-giftcode"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  echo Port 5201 already in use by PID %%a
  echo Stop it first or use restart-all.bat
  pause
  exit /b 1
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
echo  Keep THIS window open while using giftcode.
echo ================================
echo.

python -m pip install -r requirements.txt -q 2>nul

python main.py
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" (
  echo.
  echo [ERROR] Giftcode exited with code %EC%
  pause
)
exit /b %EC%
