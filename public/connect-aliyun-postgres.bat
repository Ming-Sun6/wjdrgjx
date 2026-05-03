@echo off
setlocal
chcp 65001 >nul
title Connect Aliyun PostgreSQL

set "PGHOST=postgres.example.com"
set "PGPORT=5432"
set "PGUSER=db_user"
set "PGDATABASE=postgres"

echo ========================================
echo  Aliyun PostgreSQL one-click login
echo ========================================
echo Host: %PGHOST%
echo Port: %PGPORT%
echo User: %PGUSER%
echo DB  : %PGDATABASE%
echo.

for %%P in (psql.exe) do set "PSQL_EXE=%%~$PATH:P"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles%\PostgreSQL\17\bin"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles%\PostgreSQL\16\bin"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles%\PostgreSQL\15\bin"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles%\PostgreSQL\14\bin"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles(x86)%\PostgreSQL\17\bin"
if not defined PSQL_EXE call :usePsqlDir "%ProgramFiles(x86)%\PostgreSQL\16\bin"

if not defined PSQL_EXE (
  echo [ERROR] psql command was not found.
  echo.
  echo Please install PostgreSQL Client, or add PostgreSQL bin directory to PATH.
  echo Common path: C:\Program Files\PostgreSQL\16\bin
  echo Download: https://www.postgresql.org/download/windows/
  echo.
  pause
  exit /b 1
)

echo If a password is required, enter it below. It is normal that typed password characters are hidden.
echo.
"%PSQL_EXE%" -h "%PGHOST%" -p "%PGPORT%" -U "%PGUSER%" -d "%PGDATABASE%"
set "PSQL_STATUS=%errorlevel%"

echo.
echo Connection closed.
pause

exit /b %PSQL_STATUS%

:usePsqlDir
if exist "%~1\psql.exe" set "PSQL_EXE=%~1\psql.exe"
exit /b 0
