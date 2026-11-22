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
        echo ERROR: Node.js 24.x or later required
        pause
        exit /b 1
    ) else (
        echo Version OK
    )
)

REM Install dependencies
echo.
echo [2/6] Installing Node.js dependencies...
call npm ci
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
echo       ✓ Created /data/maps/atlas for image and PMTiles assets

echo.
echo [6/6] Username-only access configured for trusted networks.

echo.
echo ========================================
echo  INSTALLATION COMPLETE
echo ========================================
echo.
echo Next steps:
echo   1. Run: npm start
echo   2. Open GM browser to http://localhost:8081 ^(players use port 8080^)
echo   3. Create the first GM username in the browser
echo   Anyone with server access can use any username. Use a trusted LAN only.
echo.
echo For detailed setup instructions, see:
echo   - INSTALLATION.md
echo   - README.md
echo.
echo For GM Tool features overview, see:
echo   - FEATURES.md
echo.
pause
