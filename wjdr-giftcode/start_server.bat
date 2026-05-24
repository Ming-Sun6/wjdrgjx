@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM Edit paths below if auto-detect fails
set "PHPSTUDY_DIR="
set "REDIS_SERVER="
set "PYTHON_CMD=python"
set "APP_PORT=5201"

cd /d "%~dp0"
title WJDR Gift Code Server

echo.
echo ========================================
echo   WJDR Gift Code - Local Server
echo ========================================
echo.

REM Find phpStudy / XP.CN
if not defined PHPSTUDY_DIR (
  for %%d in (C D E F) do (
    if exist "%%d:\phpstudy_pro\Extensions\" (
      set "PHPSTUDY_DIR=%%d:\phpstudy_pro"
      goto found_phpstudy
    )
    if exist "%%d:\XP.cn\Extensions\" (
      set "PHPSTUDY_DIR=%%d:\XP.cn"
      goto found_phpstudy
    )
  )
)
:found_phpstudy
if defined PHPSTUDY_DIR (
  echo [INFO] phpStudy dir: %PHPSTUDY_DIR%
) else (
  echo [WARN] phpStudy not found. Set PHPSTUDY_DIR in this bat, or start MySQL in XP.CN panel.
)

REM MySQL port 3306
call :port_listening 3306
if errorlevel 1 (
  echo [START] MySQL not running, trying to start...
  call :start_mysql
  timeout /t 3 /nobreak >nul
  call :port_listening 3306
  if errorlevel 1 (
    echo [WARN] MySQL still not on port 3306. Start it in XP.CN panel and run again.
  ) else (
    echo [OK] MySQL is running on port 3306
  )
) else (
  echo [SKIP] MySQL already running on port 3306
)

REM Redis port 6379
if not defined REDIS_SERVER (
  if exist "C:\redis\redis-server.exe" set "REDIS_SERVER=C:\redis\redis-server.exe"
  if exist "C:\Program Files\Redis\redis-server.exe" set "REDIS_SERVER=C:\Program Files\Redis\redis-server.exe"
)

call :port_listening 6379
if errorlevel 1 (
  if defined REDIS_SERVER (
    echo [START] Redis not running, trying to start...
    start "" /min "%REDIS_SERVER%"
    timeout /t 2 /nobreak >nul
    call :port_listening 6379
    if errorlevel 1 (
      echo [WARN] Redis failed to start. Some features may not work.
    ) else (
      echo [OK] Redis is running on port 6379
    )
  ) else (
    echo [WARN] redis-server.exe not found. Set REDIS_SERVER in this bat.
  )
) else (
  echo [SKIP] Redis already running on port 6379
)

REM Python
%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python not found. Install Python 3.11+ and add to PATH.
  pause
  exit /b 1
)
for /f "tokens=*" %%v in ('%PYTHON_CMD% --version 2^>^&1') do echo [INFO] %%v

REM .env file
if not exist ".env" (
  echo [ERROR] Missing .env file. Copy .env.example to .env and fill in values.
  pause
  exit /b 1
)

REM pip install
%PYTHON_CMD% -c "import flask" >nul 2>&1
if errorlevel 1 (
  echo [INSTALL] Installing Python packages...
  %PYTHON_CMD% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
  if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
  )
)

REM validate .env
%PYTHON_CMD% -c "from dotenv import load_dotenv; import os; load_dotenv(); exit(0 if (os.getenv('MYSQL_URL') or '').strip() else 1)" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] MYSQL_URL is empty in .env
  echo Example: mysql+pymysql://root:root@127.0.0.1:3306/wjdr?charset=utf8mb4
  pause
  exit /b 1
)
%PYTHON_CMD% -c "from dotenv import load_dotenv; import os; load_dotenv(); exit(0 if (os.getenv('SECRET_KEY') or '').strip() else 1)" >nul 2>&1
if errorlevel 1 echo [WARN] SECRET_KEY is empty in .env
%PYTHON_CMD% -c "from dotenv import load_dotenv; import os; load_dotenv(); exit(0 if (os.getenv('REDIS_HOST') or '').strip() else 1)" >nul 2>&1
if errorlevel 1 echo [WARN] REDIS_HOST is empty in .env - use 127.0.0.1

REM frontend build
if not exist "static\css\tailwindcss.css" (
  echo [BUILD] Tailwind CSS...
  call :ensure_node
  if errorlevel 1 goto end_fail
  if not exist "node_modules\" call npm install
  call npx tailwindcss -i static/css/input.css -o static/css/tailwindcss.css --minify
)

if not exist "static\js\app966.wjdr.js" (
  echo [BUILD] Webpack JS bundle...
  call :ensure_node
  if errorlevel 1 goto end_fail
  if not exist "node_modules\" call npm install
  call npx webpack --config webpack.config.js
)

echo.
echo [RUN] http://127.0.0.1:%APP_PORT%/
echo [TIP] Press Ctrl+C to stop
echo.

start "" "http://127.0.0.1:%APP_PORT%/"
%PYTHON_CMD% main.py
set EXIT_CODE=%ERRORLEVEL%
echo.
echo Server stopped. Exit code: %EXIT_CODE%
pause
exit /b %EXIT_CODE%

:port_listening
set "CHECK_PORT=%~1"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%CHECK_PORT% " ^| findstr "LISTENING"') do exit /b 0
exit /b 1

:start_mysql
if not defined PHPSTUDY_DIR exit /b 1
for /d %%m in ("%PHPSTUDY_DIR%\Extensions\MySQL*") do (
  if exist "%%~m\bin\mysqld.exe" (
    set "MYSQL_HOME=%%~m"
    goto mysql_found
  )
)
exit /b 1

:mysql_found
set "MYSQL_INI=%MYSQL_HOME%\my.ini"
if not exist "%MYSQL_INI%" set "MYSQL_INI=%MYSQL_HOME%\my.cnf"
echo [INFO] MySQL path: %MYSQL_HOME%
start "" /min "%MYSQL_HOME%\bin\mysqld.exe" --defaults-file="%MYSQL_INI%"
exit /b 0

:ensure_node
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 20+ for frontend build.
  exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [INFO] Node %%v
exit /b 0

:end_fail
pause
exit /b 1
