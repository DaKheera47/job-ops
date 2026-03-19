# CLAUDE.md

## Project Overview

Job-Ops is a job search automation platform that crawls multiple job boards, scores listings with an LLM, and generates tailored resume PDFs.

## Architecture

- **Orchestrator** (`orchestrator/`) — Full-stack app (React frontend + Node/Express backend) managing the pipeline UI, job state, and scheduling
- **Extractors** (`extractors/`) — Plugin-based scrapers for each job source (JobSpy/Python, Adzuna/TS, Playwright-based crawlers)
- **Shared** (`shared/`) — Common types and utilities shared across packages

## Tech Stack

- **Frontend**: React, TypeScript, Vite, TailwindCSS, shadcn/ui
- **Backend**: Node.js, Express, SQLite (Drizzle ORM)
- **Crawlers**: Mix of Python (JobSpy), TypeScript, and Playwright/Crawlee
- **PDF Generation**: RxResume v4

## Key Patterns

- Extractors implement `ExtractorManifest` interface with a `run()` method
- Job lifecycle: `discovered → processing → ready → applied → in_progress / rejected`
- Pipeline steps: Discovery → Import → Score → Select → Process
- State tracked via URL params (tab, jobId) with React Router
- Real-time progress via Server-Sent Events (SSE)

## Development

```bash
# Install dependencies
npm install

# Run the orchestrator (frontend + backend)
cd orchestrator && npm run dev
```

## Database

SQLite with WAL mode, managed by Drizzle ORM. Schema in `orchestrator/src/server/db/schema.ts`.

## Rules

- NEVER set yourself (Claude/AI) as commit author — commits must use the user's git identity.
- NEVER include "Generated with Claude Code" or similar AI attribution in PR descriptions.
- NEVER add a `Co-Authored-By` line for Claude or any AI in commit messages.
- Before editing server routes/services, read [`AGENTS.md`](./AGENTS.md) for API response contracts, logging, SSE, and redaction standards.

## Pre-PR Checklist

Run all of these **before committing and opening a PR**. See [CONTRIBUTING.md](./CONTRIBUTING.md) for full details.

### 1. CI-parity checks (must all pass)

```bash
./orchestrator/node_modules/.bin/biome ci .
npm run check:types:shared
npm --workspace orchestrator run check:types
npm --workspace gradcracker-extractor run check:types
npm --workspace ukvisajobs-extractor run check:types
npm --workspace orchestrator run build:client
npm --workspace orchestrator run test:run
```

If `better-sqlite3` ABI mismatch: `npm --workspace orchestrator rebuild better-sqlite3`

CI runs on **Node 22** — verify locally with Node 22 if behavior differs.

### 2. PR standards

- One PR per change/problem — don't bundle unrelated work.
- If the change is user-visible, update docs or link a docs PR.
- Include screenshots or short clips for UI changes.
- Mention tradeoffs or follow-up work in the PR description.
