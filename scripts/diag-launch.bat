@echo off
setlocal
chcp 65001 >nul
echo ============================================================
echo  Aether Island - diagnostic launcher
echo ============================================================
set "APP=%~dp0"
set "LOGDIR=%APPDATA%\Aether Island"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\start-log.txt"

echo [%DATE% %TIME%] launching: "%APP%Aether Island.exe" >> "%LOG%" 2>nul
echo Launching. If the island does not appear, this window shows any crash output.

start "" "%APP%Aether Island.exe"

rem tunggu & pantau proses
timeout /t 8 /nobreak >nul
tasklist /FI "IMAGENAME eq Aether Island.exe" 2>nul | find /I "Aether Island.exe" >nul
if errorlevel 1 (
  echo [%DATE% %TIME%] PROCESS NOT RUNNING after 8s >> "%LOG%" 2>nul
  echo.
  echo [DIAG] "Aether Island.exe" TIDAK berjalan. Lihat log:
  echo   %LOG%
) else (
  echo.
  echo [DIAG] Proses "Aether Island.exe" berjalan.
)

echo.
echo --- isi %LOG% ---
type "%LOG%" 2>nul

echo.
echo --- resources yang dipakai ---
dir /b "%APP%resources\scripts" 2>nul
dir /b "%APP%resources\build" 2>nul

echo.
pause
