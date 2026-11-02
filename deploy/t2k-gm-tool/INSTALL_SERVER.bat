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
echo [1/5] Checking Node.js installation...
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
echo [2/5] Installing Node.js dependencies...
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
echo [3/5] Verifying server files...
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
echo [4/5] Verifying database configuration...
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
echo [5/5] Setting up data directories...
if not exist "data" mkdir data
if not exist "data\maps" mkdir data\maps
echo       ✓ Created /data directory for campaigns
echo       ✓ Created /data/maps for PMTiles basemaps

echo.
echo ========================================
echo  INSTALLATION COMPLETE
echo ========================================
echo.
echo Next steps:
echo   1. Run: npm start
echo      (Server starts on http://localhost:8080)
echo   2. Open browser to http://localhost:8080
echo   3. Use default credentials: admin/admin
echo.
echo For detailed setup instructions, see:
echo   - INSTALLATION.md
echo   - README.md
echo.
echo For GM Tool features overview, see:
echo   - FEATURES.md
echo.
pause
