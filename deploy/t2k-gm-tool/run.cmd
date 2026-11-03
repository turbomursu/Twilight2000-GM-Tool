@echo off
cd /d "%~dp0"
if not defined FIELDBOOK_BOOTSTRAP_TOKEN if exist token.txt set /p FIELDBOOK_BOOTSTRAP_TOKEN=<token.txt
call npm start