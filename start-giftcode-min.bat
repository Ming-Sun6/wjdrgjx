@echo off
setlocal EnableExtensions
cd /d "%~dp0wjdr-giftcode" || exit /b 1

call "%~dp0scripts\find-python.bat"
if errorlevel 1 exit /b 1

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

set "GIFTCODE_URL_PREFIX=/giftcode"
set "GIFTCODE_PORT=5201"

if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

if not exist "..\logs" mkdir "..\logs" >nul 2>&1

"%PYTHON_CMD%" -m pip install -r requirements.txt -q 2>nul
"%PYTHON_CMD%" main.py >> "..\logs\giftcode.log" 2>&1
exit /b %ERRORLEVEL%
