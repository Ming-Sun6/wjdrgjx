@echo off
setlocal EnableExtensions
set "PYTHON_CMD="

if exist "%~dp0..\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /i /b "PYTHON_CMD=" "%~dp0..\.env" 2^>nul`) do (
    set "PYTHON_CMD=%%B"
  )
)

if defined PYTHON_CMD if exist "%PYTHON_CMD%" goto :found

for /f "delims=" %%P in ('where python 2^>nul') do (
  set "PYTHON_CMD=%%P"
  goto :found
)

if exist "C:\Python314\python.exe" set "PYTHON_CMD=C:\Python314\python.exe" & goto :found
if exist "C:\Python313\python.exe" set "PYTHON_CMD=C:\Python313\python.exe" & goto :found
if exist "C:\Python312\python.exe" set "PYTHON_CMD=C:\Python312\python.exe" & goto :found
if exist "C:\Python311\python.exe" set "PYTHON_CMD=C:\Python311\python.exe" & goto :found

where py >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%V in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do (
    set "PYTHON_CMD=%%V"
    goto :found
  )
)

echo [ERROR] Python not found.
echo Install Python 3 from https://www.python.org/downloads/
echo Or set PYTHON_CMD in .env to full path, e.g. C:\Python312\python.exe
exit /b 1

:found
endlocal & set "PYTHON_CMD=%PYTHON_CMD%"
exit /b 0
