@echo off
rem Aim Harness launcher.
rem First run: creates .venv and installs the package. Every later run checks
rem that the installation is importable and repairs it if an earlier install
rem was interrupted. Arguments are passed through, e.g.
rem   start.bat report      start.bat play gridshot      start.bat inputtest
setlocal
cd /d "%~dp0"
set "VPY=.venv\Scripts\python.exe"
set "PYCHECK=import sys, struct; sys.exit(0 if sys.version_info >= (3, 11) and struct.calcsize('P') == 8 else 1)"

if exist "%VPY%" goto :check
call :find_python
if errorlevel 1 goto :no_python
echo Erstelle virtuelle Umgebung mit %PYCMD% ...
%PYCMD% -m venv .venv
if errorlevel 1 goto :install_failed

:check
"%VPY%" -c "%PYCHECK%" <nul >nul 2>&1
if errorlevel 1 goto :bad_venv
"%VPY%" -c "import aimharness, pygame, numpy, pandas, pyarrow, scipy, matplotlib" <nul >nul 2>&1
if not errorlevel 1 goto :run

echo Installiere Aim Harness und Abhaengigkeiten ...
"%VPY%" -m pip install --upgrade pip
if errorlevel 1 goto :install_failed
"%VPY%" -m pip install -e .
if errorlevel 1 goto :install_failed
"%VPY%" -c "import aimharness, pygame" <nul
if errorlevel 1 goto :install_failed
echo Installation abgeschlossen.

:run
"%VPY%" -m aimharness %*
if errorlevel 1 pause
exit /b

:find_python
rem Prefer the py launcher, fall back to python on PATH. Requires 3.11+ and 64-bit.
set "PYCMD="
py -3 -c "%PYCHECK%" <nul >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=py -3"
    exit /b 0
)
python -c "%PYCHECK%" <nul >nul 2>&1
if not errorlevel 1 (
    set "PYCMD=python"
    exit /b 0
)
exit /b 1

:no_python
echo.
echo Kein passendes Python gefunden. Benoetigt wird Python 3.11 oder neuer, 64-Bit:
echo   https://www.python.org/downloads/
pause
exit /b 1

:bad_venv
echo.
echo Die vorhandene .venv nutzt eine ungeeignete Python-Version, benoetigt wird 3.11+ 64-Bit.
echo Bitte den Ordner .venv loeschen und start.bat erneut starten.
pause
exit /b 1

:install_failed
echo.
echo Installation fehlgeschlagen. Die Ursache steht in der Meldung darueber.
echo Beim naechsten Start versucht start.bat die Installation erneut.
pause
exit /b 1
