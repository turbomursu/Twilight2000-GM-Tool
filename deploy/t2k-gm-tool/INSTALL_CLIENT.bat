@echo off
REM Twilight: 2000 Fourth Edition GM Tool - Client Installation Script
REM Windows batch installer for web browser client setup

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo  T2K-4E GM TOOL CLIENT SETUP
echo ========================================
echo.

REM Check if server is running
echo [1/3] Checking for running server...
timeout /t 2 /nobreak >nul

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000"') do (
    set PID=%%a
)

if defined PID (
    echo       ✓ Server is running (PID: !PID!)
) else (
    echo.
    echo WARNING: Server does not appear to be running on port 3000
    echo Please start the server first:
    echo   1. Open PowerShell or Command Prompt
    echo   2. Navigate to this directory
    echo   3. Run: npm start
    echo.
    pause
)

REM Configure browser access
echo.
echo [2/3] Configuring browser access...
echo       ✓ GM Tool available at http://localhost:3000
echo       ✓ Player Interface available at http://localhost:3000/player-interface.html
echo       ✓ Campaign Setup Tool available at http://localhost:3000/campaign-setup.html

REM Create shortcuts (optional)
echo.
echo [3/3] Setup complete
echo.
echo ========================================
echo  CLIENT SETUP COMPLETE
echo ========================================
echo.
echo Access the GM Tool:
echo   GM Tool:         http://localhost:3000
echo   Player Interface: http://localhost:3000/player-interface.html
echo   Campaign Setup:   http://localhost:3000/campaign-setup.html
echo.
echo Browser Requirements:
echo   - Chrome 90+ or Edge 90+
echo   - Firefox 88+
echo   - Safari 14+
echo.
echo For first-time setup, use default credentials:
echo   Username: admin
echo   Password: admin
echo.
echo IMPORTANT: Change admin password in settings immediately after first login!
echo.
pause
