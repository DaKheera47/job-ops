#!/bin/bash
# Start Job Ops on port 1000 using Node 22
export NODE22="/tmp/node22/node-v22.22.2-win-x64/node.exe"
export NODE_ENV=production
export PORT=1000

cd "$(dirname "$0")/orchestrator"
exec $NODE22 /c/Apps/job-ops/node_modules/tsx/dist/cli.mjs src/server/index.ts
