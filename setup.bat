@echo off
REM =========================================
REM setup.bat - Auto installation + server execution
REM =========================================

REM 1. Check / Create package.json
IF NOT EXIST package.json (
    echo creating package.json
    call npm init -y
) ELSE (
    echo package.json check successful
)

REM 2. Check / Install node_modules
IF NOT EXIST node_modules (
    echo installing packages (express, body-parser, typescript)
    call npm install express body-parser typescript
) ELSE (
    echo node_modules check successful
)

REM 3. Start server
echo starting server: node server.js
call node server.js

pause