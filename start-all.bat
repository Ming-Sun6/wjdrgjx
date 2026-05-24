@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ================================
echo  WJDR Toolbox + Giftcode Center
echo ================================
echo  Keep THIS window open while you use the site.
echo  Press Ctrl+C here to stop the server.
echo.

call :port_listening 5201
if errorlevel 1 (
  echo [1/2] Starting giftcode Flask on port 5201 ...
  start "wjdr-giftcode" /min "%~dp0start-giftcode.bat"
  timeout /t 3 /nobreak >nul
) else (
  echo [1/2] Giftcode already running on port 5201
)

echo [2/2] Starting Node site on port 3000 ...
echo   Home:    http://localhost:3000/
echo   Giftcode: http://localhost:3000/giftcode/
echo.

node server.js

echo.
echo Server stopped.
pause
exit /b 0

:port_listening
netstat -ano | findstr /R /C:":%1 .*LISTENING" >nul 2>&1
exit /b %errorlevel%
