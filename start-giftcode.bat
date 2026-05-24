@echo off
setlocal EnableExtensions
cd /d "%~dp0wjdr-giftcode" || (echo [ERROR] wjdr-giftcode folder not found. & pause & exit /b 1)

where python >nul 2>&1 || (echo [ERROR] Python not found. Install Python 3 and add to PATH. & pause & exit /b 1)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  echo Port 5201 already in use by PID %%a
  echo Close it first or run restart-all.bat
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
echo  WJDR Giftcode Flask port %GIFTCODE_PORT%
echo  Keep THIS window open.
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
