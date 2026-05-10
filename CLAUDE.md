# Job-Ops – Agent Instructions

> These instructions apply to **every AI agent** (Claude Code, Gemini CLI, OpenCode, Cursor, Codex) working in this repository.

## Project Overview

Job-ops is a monorepo (orchestrator, shared, extractors, docs-site) for automated job search and application tracking. Node.js 22, Express backend, React frontend, SQLite (Drizzle ORM), Docker-based deployment.

**Primary user interface: Telegram bot.**

## Environment

- **No node/npm on host machine.** All commands run inside Docker.
- Docker image: `node:22-slim` for quick checks, `docker compose` for full stack.
- Intel corporate proxy: `http://proxy-dmz.intel.com:912`, CA certs at `gnai-ca-certs.pem`.

## Mandatory: Validate Before Reporting

**Never report work as done without validation.** Before telling the developer that changes are complete:

1. **Type check** — run inside Docker:
   ```bash
   MSYS_NO_PATHCONV=1 docker run --rm -v "<repo-path>:/app" -w /app node:22-slim \
     sh -c "npx tsc --noEmit -p shared/tsconfig.json && npx tsc --noEmit -p orchestrator/tsconfig.json"
   ```
   Verify that **no new errors were introduced** (pre-existing errors in `linkedin-auto-apply` module are known and acceptable).

2. **Unit tests** — run inside Docker:
   ```bash
   MSYS_NO_PATHCONV=1 docker run --rm -v "<repo-path>:/app" -w /app node:22-slim \
     sh -c "./orchestrator/node_modules/.bin/vitest run"
   ```
   Verify that **no previously passing tests now fail**.

3. **Docker build** (if Dockerfile or extractor structure changed):
   ```bash
   docker compose build --no-cache
   ```

4. **Report results honestly.** If something fails, say so — don't hide errors.

## Mandatory: Changelog Notifications

After implementing **user-facing features, significant improvements, or important fixes**, the agent MUST ask the developer:

> "Should I add this to the changelog so Telegram bot users are notified?"

If the developer says yes:

1. Open `orchestrator/src/server/services/telegram-bot/changelog.ts`
2. Add a new entry to the `CHANGELOG` array (newest first) with:
   - `version` — bump appropriately (patch for fixes, minor for features)
   - `date` — today's date in YYYY-MM-DD
   - `items` — array of changes, each with:
     - `title` — emoji + short name (e.g., "📡 ATS Board Scanner")
     - `description` — 1-2 sentences in **simple, non-technical language**. Any user should understand what changed and how it helps them.
     - `tip` (optional) — brief instruction on how to use the new feature
3. The Telegram bot automatically sends and **pins** the message to all users on next startup.

### Writing guidelines for changelog entries:
- Write for non-technical users
- Explain WHAT changed and WHY it's useful, not HOW it was implemented
- If the user needs to take action, include a `tip`
- Keep it brief — 1-2 sentences per item max
- Use English

## Key Architecture Notes

### Telegram Bot
- Grammy library, long-polling mode
- Handlers in `orchestrator/src/server/services/telegram-bot/handlers/`
- Callback routing: `j:` jobs, `p:` pipeline, `s:` stats, `x:` settings, `b:` boards, `a:` auto-apply, `m:` menu
- Auth via `/link <code>` with one-time codes from Settings UI
- The bot is the PRIMARY user interface — all new features should have Telegram integration

### Extractors
- Each extractor is a workspace package in `extractors/<name>/`
- Must export an `ExtractorManifest` from `manifest.ts` or `src/manifest.ts`
- Register source IDs in `shared/src/extractors/index.ts`
- **If adding a new extractor, also add it to the Dockerfile** (both build and production stages)

### Settings
- Defined in `shared/src/settings-registry.ts` (Zod schemas, parse/serialize)
- `SettingKey` type is derived from registry keys — new settings must be registered there

### LLM Providers
- 8 providers in `orchestrator/src/server/services/llm/providers/`
- Factory pattern via `createProviderStrategy`
- Anthropic provider uses GNAI endpoint with JWT auth

### PDF Generation
- Two renderers: `rxresume` (default) and `latex`
- ATS text normalization applied in `orchestrator/src/server/services/rxresume/tailoring.ts`

## Common Pitfalls

- **Docker path with spaces**: Use `MSYS_NO_PATHCONV=1` prefix on Windows/Git Bash
- **New extractor not loading**: Check it's in Dockerfile AND registered in `shared/src/extractors/index.ts`
- **New setting not recognized**: Must be added to `shared/src/settings-registry.ts`
- **Telegram menu not updating**: Docker build cache — use `--no-cache`
- **Type errors in `Record<ExtractorSourceId, ...>`**: When adding source IDs, also update `demo-defaults.data.ts` and `extractor-health.ts`

## Karpathy Coding Principles

> These four behavioral principles apply to every AI agent working in this repository. Source: [andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills).

### 1. Think Before Coding

State your assumptions explicitly. If uncertain, ask. If multiple interpretations exist, present them — don't pick silently. Surface confusion and tradeoffs upfront rather than making silent decisions.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative. No features beyond what was asked. No over-engineering, unnecessary abstractions, or unasked flexibility.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess. Don't "improve" adjacent code unless the user requested it. Every change must directly trace to the user's request.

### 4. Goal-Driven Execution

Define success criteria before writing code. Transform tasks into verifiable goals with a brief plan listing steps and verification checks. Loop until verified — don't declare done until the goal is measurably met.
