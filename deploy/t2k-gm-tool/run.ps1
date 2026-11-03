Set-Location $PSScriptRoot

if (-not $env:FIELDBOOK_BOOTSTRAP_TOKEN) {
    $tokenPath = Join-Path $PSScriptRoot "token.txt"
    if (Test-Path -LiteralPath $tokenPath) {
        $env:FIELDBOOK_BOOTSTRAP_TOKEN = [System.IO.File]::ReadAllText($tokenPath).Trim()
    }
}

npm start