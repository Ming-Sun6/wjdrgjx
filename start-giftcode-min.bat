@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0" || exit /b 1

if not exist "logs" mkdir "logs" >nul 2>&1

where node >nul 2>&1
if errorlevel 1 (
  echo [%date% %time%] Node.js not found>> "logs\giftcode.log"
  exit /b 1
)

rem 已在运行则直接成功，避免误杀正在服务的进程
netstat -ano | findstr ":5201" | findstr /i "LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo [%date% %time%] Port 5201 already listening, skip start>> "logs\giftcode.log"
  exit /b 0
)

set "PYTHON_CMD="
if exist "C:\Python314\python.exe" set "PYTHON_CMD=C:\Python314\python.exe"
if exist "C:\Python313\python.exe" if not defined PYTHON_CMD set "PYTHON_CMD=C:\Python313\python.exe"
if exist "C:\Python312\python.exe" if not defined PYTHON_CMD set "PYTHON_CMD=C:\Python312\python.exe"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /i /b "PYTHON_CMD=" ".env" 2^>nul`) do (
    set "PYRAW=%%B"
  )
)
if defined PYRAW (
  set "PYRAW=!PYRAW:"=!"
  for /f "tokens=* delims= " %%T in ("!PYRAW!") do set "PYTHON_CMD=%%T"
)

echo.>> "logs\giftcode.log"
echo ===== giftcode start %date% %time% =====>> "logs\giftcode.log"

node "%~dp0scripts\giftcode-start-min.js"
exit /b %ERRORLEVEL%
