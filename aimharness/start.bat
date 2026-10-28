@echo off
rem Aim Harness launcher: creates .venv on first run, then starts the trainer.
rem Arguments are passed through, e.g.  start.bat report   or   start.bat play gridshot
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Erstelle virtuelle Umgebung ...
    py -3 -m venv .venv || goto :error
    ".venv\Scripts\python.exe" -m pip install --upgrade pip || goto :error
    ".venv\Scripts\python.exe" -m pip install -e . || goto :error
)
".venv\Scripts\python.exe" -m aimharness %*
if errorlevel 1 pause
goto :eof

:error
echo.
echo Installation fehlgeschlagen. Ist Python 3.11+ (64-Bit) installiert?  py --version
pause
