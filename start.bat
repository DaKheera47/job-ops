@echo off
echo Starting Job Ops on port 1000...
set NODE_ENV=production
set PORT=1000
set NODE22=%~dp0..\..\..\tmp\node22\node-v22.22.2-win-x64\node.exe

if not exist "%NODE22%" (
    echo ERROR: Node 22 not found at %NODE22%
    echo Please ensure /tmp/node22/node-v22.22.2-win-x64/node.exe exists
    pause
    exit /b 1
)

cd /d %~dp0orchestrator
"%NODE22%" "%~dp0..\node_modules\tsx\dist\cli.mjs" src\server\index.ts
