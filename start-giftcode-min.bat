@echo off
setlocal EnableExtensions
cd /d "%~dp0wjdr-giftcode"

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":5201 .*LISTENING"') do (
  taskkill /F /PID %%a >nul 2>&1
)

set "GIFTCODE_URL_PREFIX=/giftcode"
set "GIFTCODE_PORT=5201"

if not exist ".env" (
  if exist ".env.example" copy /Y ".env.example" ".env" >nul
)

if not exist "..\logs" mkdir "..\logs" >nul 2>&1

python -m pip install -r requirements.txt -q 2>nul

python main.py >> "..\logs\giftcode.log" 2>&1
if errorlevel 1 (
  echo Giftcode crashed. Last lines of logs\giftcode.log:
  echo ----------------------------------------
  powershell -NoProfile -Command "Get-Content '..\logs\giftcode.log' -Tail 15 -ErrorAction SilentlyContinue"
  echo ----------------------------------------
  pause
)
