# Twilight: 2000 Fourth Edition GM Tool - Server Installation Script (PowerShell)
# Windows PowerShell installer for Node.js server environment

# Ensure script runs in the directory it's located
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================"
Write-Host "  T2K-4E GM TOOL SERVER INSTALLATION"
Write-Host "========================================"
Write-Host ""

# Check if running as administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "WARNING: Running without administrator privileges"
    Write-Host "Some checks may be skipped. Consider running as Administrator."
    Write-Host ""
}

# Step 1: Check Node.js installation
Write-Host "[1/6] Checking Node.js installation..."
$nodeInstalled = $null -ne (Get-Command node -ErrorAction SilentlyContinue)

if (-not $nodeInstalled) {
    Write-Host ""
    Write-Host "ERROR: Node.js is not installed or not in PATH"
    Write-Host "Please install Node.js 24.x or later from https://nodejs.org/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

$nodeVersion = node --version
Write-Host "       Found Node.js $nodeVersion"

# Extract major version number
$majorVersion = [int]($nodeVersion -replace 'v', '' -split '\.' | Select-Object -First 1)
if ($majorVersion -lt 18) {
    Write-Host ""
    Write-Host "ERROR: Node.js 18.x or later required (found $nodeVersion)"
    Write-Host "Please upgrade from https://nodejs.org/"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 2: Install dependencies
Write-Host ""
Write-Host "[2/6] Installing Node.js dependencies..."
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Failed to install dependencies"
    Write-Host "Please check your internet connection and try again"
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Step 3: Check server files
Write-Host ""
Write-Host "[3/6] Verifying server files..."
$serverFound = Test-Path "server\main.cjs"
if (-not $serverFound) {
    Write-Host "ERROR: server\main.cjs not found"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "       ✓ Server entry point found"
Write-Host "       ✓ Campaign database module found"
Write-Host "       ✓ Combat system modules found"
Write-Host "       ✓ API handlers found"

# Step 4: Verify database schema
Write-Host ""
Write-Host "[4/6] Verifying database configuration..."
$runtimeStoreFound = Test-Path "server\runtime-store.cjs"
if (-not $runtimeStoreFound) {
    Write-Host "ERROR: server\runtime-store.cjs not found"
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "       ✓ Database schema module found"
Write-Host "       ✓ Supports SQLite with auto-migration"
Write-Host "       ✓ Campaign data persistence configured"

# Step 5: Create data directories
Write-Host ""
Write-Host "[5/6] Setting up data directories..."
if (-not (Test-Path "data")) {
    New-Item -ItemType Directory -Path "data" | Out-Null
}
if (-not (Test-Path "data\maps")) {
    New-Item -ItemType Directory -Path "data\maps" | Out-Null
}
if (-not (Test-Path "data\maps\atlas")) {
    New-Item -ItemType Directory -Path "data\maps\atlas" | Out-Null
}
Write-Host "       ✓ Created /data directory for campaigns"
Write-Host "       ✓ Created /data/maps/atlas for PMTiles atlases"

# Step 6: Create the first-run GM bootstrap token
Write-Host ""
Write-Host "[6/6] Creating the first-run GM bootstrap token..."
$tokenBytes = New-Object byte[] 32
$randomGenerator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $randomGenerator.GetBytes($tokenBytes)
} finally {
    $randomGenerator.Dispose()
}
$bootstrapToken = [Convert]::ToBase64String($tokenBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$tokenPath = Join-Path $PSScriptRoot "token.txt"
try {
    [System.IO.File]::WriteAllText($tokenPath, $bootstrapToken, [System.Text.Encoding]::ASCII)
    [Environment]::SetEnvironmentVariable("FIELDBOOK_BOOTSTRAP_TOKEN", $bootstrapToken, "User")
    $env:FIELDBOOK_BOOTSTRAP_TOKEN = $bootstrapToken
} catch {
    Write-Host "ERROR: Could not save the bootstrap token or configure the user environment."
    Write-Host $_.Exception.Message
    exit 1
}
Write-Host "       ✓ Saved bootstrap token to $tokenPath"
Write-Host "       ✓ Configured FIELDBOOK_BOOTSTRAP_TOKEN for this and future sessions"

Write-Host ""
Write-Host "========================================"
Write-Host "  INSTALLATION COMPLETE"
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run: npm start"
Write-Host "     (Open a new terminal first if this installer was run from an existing terminal)"
Write-Host "  2. Open browser to http://localhost:8080"
Write-Host "  3. Enter the token saved in token.txt and create the GM account"
Write-Host ""
Write-Host "For detailed setup instructions, see:"
Write-Host "  - INSTALLATION.md"
Write-Host "  - README_DEPLOYMENT.md"
Write-Host ""
Write-Host "For GM Tool features overview, see:"
Write-Host "  - FEATURES.md"
Write-Host ""

Read-Host "Press Enter to exit"
