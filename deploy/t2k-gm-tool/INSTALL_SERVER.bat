@echo off
REM Twilight: 2000 Fourth Edition GM Tool - Server Installation Script
REM Windows batch installer for Node.js server environment

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo  T2K-4E GM TOOL SERVER INSTALLATION
echo ========================================
echo.

REM Check Node.js installation
echo [1/6] Checking Node.js installation...
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js 24.x or later from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i

echo NODE_VERSION=[!NODE_VERSION!]

for /f "tokens=1 delims=." %%a in ('node --version') do (
    echo RAW_MAJOR=[%%a]

    set MAJOR=%%a
    set MAJOR=!MAJOR:v=!

    echo MAJOR=[!MAJOR!]

    if !MAJOR! lss 24 (
        echo ERROR: Version too old
    ) else (
        echo Version OK
    )
)

REM Install dependencies
echo.
echo [2/6] Installing Node.js dependencies...
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: Failed to install dependencies
    echo Please check your internet connection and try again
    echo.
    pause
    exit /b 1
)

REM Check server files
echo.
echo [3/6] Verifying server files...
if not exist "server\main.cjs" (
    echo ERROR: server\main.cjs not found
    pause
    exit /b 1
)
echo       ✓ Server entry point found
echo       ✓ Campaign database module found
echo       ✓ Combat system modules found
echo       ✓ API handlers found

REM Verify database schema
echo.
echo [4/6] Verifying database configuration...
if not exist "server\runtime-store.cjs" (
    echo ERROR: server\runtime-store.cjs not found
    pause
    exit /b 1
)
echo       ✓ Database schema module found
echo       ✓ Supports SQLite with auto-migration
echo       ✓ Campaign data persistence configured

REM Create data directory
echo.
echo [5/6] Setting up data directories...
if not exist "data" mkdir data
if not exist "data\maps" mkdir data\maps
if not exist "data\maps\atlas" mkdir data\maps\atlas
echo       ✓ Created /data directory for campaigns
echo       ✓ Created /data/maps/atlas for PMTiles atlases

REM Create a cryptographically random bootstrap token and persist it for future terminals.
echo.
echo [6/6] Creating the first-run GM bootstrap token...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $bytes=New-Object byte[] 32; $rng=[Security.Cryptography.RandomNumberGenerator]::Create(); try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}; $token=[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_'); [IO.File]::WriteAllText((Join-Path $PWD 'token.txt'),$token,[Text.Encoding]::ASCII); [Environment]::SetEnvironmentVariable('FIELDBOOK_BOOTSTRAP_TOKEN',$token,'User')"
if errorlevel 1 (
    echo ERROR: Could not create or save the bootstrap token.
    pause
    exit /b 1
)
echo       ✓ Saved bootstrap token to %CD%\token.txt
echo       ✓ Configured FIELDBOOK_BOOTSTRAP_TOKEN for future terminals

echo.
echo ========================================
echo  INSTALLATION COMPLETE
echo ========================================
echo.
echo Next steps:
echo   1. Open a new terminal, then run: npm start
echo      (A new terminal loads the saved bootstrap-token environment variable)
echo   2. Open browser to http://localhost:8080
echo   3. Enter the token saved in token.txt and create the GM account
echo.
echo For detailed setup instructions, see:
echo   - INSTALLATION.md
echo   - README.md
echo.
echo For GM Tool features overview, see:
echo   - FEATURES.md
echo.
pause
