:: Quick Command Reference for Twilight 2000 GM Tool
:: Run this file or use the commands below

@echo off
cls
echo.
echo ===== Twilight 2000 GM Tool - Quick Reference =====
echo.
echo INSTALLED:
echo   Node.js v22.11.0
echo   npm 10.9.0
echo.
echo IMPORTANT: All node commands must use --experimental-sqlite flag
echo.
echo QUICK COMMANDS:
echo.
echo 1. Run all tests:
echo    node --experimental-sqlite --test
echo.
echo 2. Start dev server:
echo    node --experimental-sqlite server/main.cjs
echo.
echo 3. Create sample data:
echo    node --experimental-sqlite server/seed-sample.cjs --db %TEMP%\fieldbook-dev.sqlite --gm "gm-user"
echo.
echo 4. View project documentation:
echo    - README.md - Project overview
echo    - FEATURES.md - Feature list and status
echo    - ROADMAP.md - Development roadmap
echo    - DATA_MODEL.md - Data model documentation
echo.
echo CONVENIENCE SCRIPTS (pre-configured with experimental flag):
echo   - run.cmd (Command Prompt)
echo   - run.ps1 (PowerShell)
echo.
echo PROJECT PATHS:
echo   Project root: C:\Users\hemuli\Twilight2000-GM-Tool
echo   Server code: .\server\
echo   Tests: .\tests\
echo   Static assets: .\ (HTML, CSS, JS files)
echo   Database: .\data\fieldbook.sqlite
echo.
echo For more details, see NODE_INSTALLATION.md
echo.
pause
