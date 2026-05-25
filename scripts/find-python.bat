@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "PYTHON_CMD="

rem --- 1) .env 中显式配置（项目根目录）---
if exist "%~dp0..\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /i /b "PYTHON_CMD=" "%~dp0..\.env" 2^>nul`) do (
    set "RAW=%%B"
  )
)
if defined RAW (
  set "RAW=!RAW:"=!"
  for /f "tokens=* delims= " %%T in ("!RAW!") do set "RAW=%%T"
  if exist "!RAW!" (
    set "PYTHON_CMD=!RAW!"
    goto :validate
  )
)

rem --- 2) 常见安装路径（优先于 where，避免 WindowsApps 假 python）---
for %%P in (
  "C:\Python314\python.exe"
  "C:\Python313\python.exe"
  "C:\Python312\python.exe"
  "C:\Python311\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python314\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
  "%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
) do (
  if exist %%P (
    set "PYTHON_CMD=%%~P"
    goto :validate
  )
)

rem --- 3) py 启动器 ---
where py >nul 2>&1
if not errorlevel 1 (
  for /f "delims=" %%V in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do (
    set "PYTHON_CMD=%%V"
    goto :validate
  )
)

rem --- 4) PATH 中的 python（跳过 WindowsApps 占位）---
for /f "delims=" %%P in ('where python 2^>nul') do (
  echo %%P | findstr /i /c:"WindowsApps" >nul
  if errorlevel 1 if exist "%%P" (
    set "PYTHON_CMD=%%P"
    goto :validate
  )
)

echo [ERROR] Python not found.
echo Install Python 3 from https://www.python.org/downloads/
echo Or add to project .env: PYTHON_CMD=C:\Python312\python.exe
exit /b 1

:validate
"!PYTHON_CMD!" -c "import sys" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Python found but cannot run: !PYTHON_CMD!
  exit /b 1
)

for %%A in ("!PYTHON_CMD!") do endlocal & set "PYTHON_CMD=%%~A"
exit /b 0
