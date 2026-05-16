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
- Callback routing: `j:` jobs, `p:` pipeline, `s:` stats, `x:` settings, `b:` boards, `m:` menu, `sa:` smart-apply, `g:` gmail
- Main menu is rendered by a single canonical `sendMainMenu()` helper — `m:menu` callback and `/menu` command both route through it. Do NOT add second copies of the menu keyboard in other handlers — that's how the "buttons disappear after returning" regression happens.
- Auth via `/link <code>` with one-time codes from Settings UI
- The bot is the PRIMARY user interface — all new features should have Telegram integration

### Smart Apply (Greenhouse + Ashby)
- Server-side Playwright (headed Firefox on `:99`) opens the ATS form, parses fields, pre-fills from the design resume + tailored PDF, then hands the live browser to the user via noVNC for review + manual submit.
- Code layout:
  - `orchestrator/src/server/services/smart-apply/` — `eligibility.ts` (URL/source check), `parsers/{greenhouse,ashby}.ts` (DOM walk via `frame.evaluate`), `prefill.ts` (label-based mapping; **no LLM drafts** for essay questions — they are left blank with `requiresReview: true`), `session.ts` (lifecycle orchestrator).
  - `orchestrator/src/server/repositories/smart-apply-sessions.ts` — `smart_apply_sessions` table CRUD.
  - `orchestrator/src/server/services/telegram-bot/handlers/smart-apply.ts` — callback flow `sa:start` → `sa:status` → `sa:abort`.
- Session lifecycle: `preparing` → `ready` → `submitted` | `expired` | `aborted` | `failed`. Status is the single source of truth; the Telegram card polls and re-renders.
- Security/reliability invariants — preserve these:
  - **Single-session guard** (`active: ActiveBrowserSession | null` at module scope in `session.ts`) — only one Playwright browser at a time.
  - **15-min viewer TTL** with auto-teardown; `expireStaleSessions()` runs on startup.
  - **Token-scoped noVNC URLs** via the challenge-viewer infrastructure — never expose the raw VNC port.
  - **Captcha skip** — if reCAPTCHA / hCaptcha / Turnstile is detected, the form is opened and pre-filled but the user is told to solve it themselves; we never attempt to defeat captchas.
  - **No auto-submit** — the user submits manually in the noVNC viewer. We detect submission by watching the page URL transition to a success route.
- Eligibility = source `greenhouse`/`ashby` OR URL matches the regexes in `eligibility.ts`. To extend to a new ATS, add a parser + eligibility branch — do NOT touch session.ts.

### Pipeline Scheduler
- File: `orchestrator/src/server/services/pipeline-scheduler.ts`
- **Periodic-check pattern, NOT a long `setTimeout`.** Reason: long timeouts don't survive Docker pause/resume, host sleep, or wall-clock changes. Previous setTimeout-based scheduler fired hours late in production.
- Ticks every 60s, checks "should this slot have fired by now?" against `pipeline_runs.started_at` for idempotency.
- Self-healing across restarts: a missed firing window is picked up within 60s of the container coming back up.
- Backups and visa-sponsor refresh keep the shared `Scheduler` abstraction (cheap idempotent jobs). Only the pipeline owns this dedicated loop. Don't migrate it back to a single-timer scheduler.

### Candidate Identity
- The design resume the user uploaded at registration is the **single source of truth** for candidate basics (name, email, phone, location).
- Read it via `orchestrator/src/server/services/candidate-profile.ts` — `getCandidateBasics()` / `getCandidateNameParts()`. 60-second cache; call `clearCandidateBasicsCache()` after the resume is edited.
- **Never** pull identity from `ctx.from.first_name` / `last_name` (Telegram profile), env vars, or hard-coded strings. PDF filenames, Telegram captions, Smart Apply form pre-fills, cover-letter sender blocks all go through this helper.

### Gmail Auto-Sync
- Scheduler: `orchestrator/src/server/services/gmail-sync-scheduler.ts` — polls every connected Gmail account on a fixed interval (default 2h; setting `gmailSyncIntervalHours`).
- Sync runner: `orchestrator/src/server/services/post-application/ingestion/gmail-sync.ts`.
- Reliability invariants: in-flight guard prevents overlap, per-account consecutive-failure counter emits a `health_alert` event after 3 strikes so the bot can prompt "Reconnect Gmail".
- OAuth setup requires env vars `GMAIL_OAUTH_CLIENT_ID` and `GMAIL_OAUTH_CLIENT_SECRET` (plus the redirect URI registered in Google Cloud Console). Without them, the connect flow surfaces "Gmail OAuth is not configured" in the Settings UI.
- Notifications: each processed email produces a Telegram message via `orchestrator/src/server/services/telegram-bot/gmail-notifications.ts`. Auto-link confidence threshold is governed by `gmailAutoLinkConfidence`; below it, the bot asks the user to confirm the link.

### Relocation Filter (Munich-or-remote)
- The current user is in Munich and does NOT relocate. Pipeline auto-skips listings that aren't in the Munich metro and aren't genuinely remote.
- `orchestrator/src/server/services/relocation-filter.ts` — `requiresRelocation(job)` predicate. Hard-coded Munich-area keyword list (München / Garching / Gräfelfing / Unterföhring / Kirchheim / Germering / Aschheim / Ottobrunn / Planegg / Martinsried / Neubiberg / Haar / Ismaning / Oberhaching / Vaterstetten / Putzbrunn / Pullach / Taufkirchen) + country-only allow-list ("Germany"/"NL"/"Europe"/"DE"/...) + explicit remote markers ("Remote"/"Anywhere"/"Home Office"/"Telearbeit"/"Werk van thuis").
- `orchestrator/src/server/pipeline/steps/filter-relocation.ts` — pipeline step that demotes discovered jobs requiring relocation to `skipped` status with reason `RELOCATION_SKIP_REASON`. Marks rather than deletes so users can still inspect them in "All Jobs".
- **Trust the location string, not `isRemote`.** LinkedIn and Indeed routinely set `isRemote=1` for hybrid roles in Berlin/Hamburg/Düsseldorf that still require relocation. The filter ignores the source's remote flag and relies on the location text.
- Currently single-tenant (Munich is hard-coded). If you generalize to other cities, parameterize the keyword list and remove the hard-coded constants — do NOT add per-tenant settings flags until that's actually needed.

### Stale Jobs Cleanup
- File: `orchestrator/src/server/services/stale-jobs-cleanup.ts` — daily 3 AM UTC scheduler.
- Removes jobs in `discovered`/`skipped`/`expired` status not updated for 90+ days. Repository helper: `deleteStaleJobs(olderThanDays)` in `orchestrator/src/server/repositories/jobs.ts`.
- **Never touches** `applied`/`in_progress`/`ready` — those represent user investment and must persist regardless of age. Preserve this invariant in any new pruning logic.
- Initialized at startup from `orchestrator/src/server/index.ts` via `initializeStaleJobsCleanup()`. Look for "Stale job cleanup scheduler started" in the logs to verify it's running after restart.

### Pipeline Step Ordering
- Order: `discoverJobs` → `preImportLiveness` → `importJobs` → `filterRelocation` → `checkLiveness` → `scoreJobs` (LLM) → `autoSkipBelowThreshold` → `selectJobs` → `processJobs`.
- Registered in `orchestrator/src/server/pipeline/steps/index.ts`; invoked in `orchestrator/src/server/pipeline/orchestrator.ts`.
- **Insert new filtering steps BEFORE `scoreJobs`.** Scoring is the LLM bottleneck — both cost and rate-limit constrained. Pre-filtering aggressively (liveness, relocation, future heuristics) saves tokens and prevents pipeline stalls when GNAI hits its $80/day cap.

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

- **Docker path with spaces**: Use `MSYS_NO_PATHCONV=1` prefix on Windows/Git Bash. Also needed for `docker exec <container> <path>` and `docker cp <src> <container>:/<dst>` when the destination path contains a leading slash that Git Bash would otherwise translate.
- **New extractor not loading**: Check it's in Dockerfile AND registered in `shared/src/extractors/index.ts`
- **New setting not recognized**: Must be added to `shared/src/settings-registry.ts`
- **Telegram menu not updating**: Docker build cache — use `--no-cache`
- **Type errors in `Record<ExtractorSourceId, ...>`**: When adding source IDs, also update `demo-defaults.data.ts` and `extractor-health.ts`
- **`docker compose restart` does NOT pick up source changes.** The container entrypoint runs `npx tsx src/server/index.ts` against code baked into the image (`ghcr.io/dakheera47/job-ops:latest`), and that image often lags behind `main`. After editing TypeScript: either `docker compose build --no-cache && docker compose up -d` to rebuild, or for quick iteration `docker cp <changed-files> job-ops:/app/orchestrator/...` followed by `docker compose restart`. Verify the running code with `MSYS_NO_PATHCONV=1 docker exec job-ops grep -n <symbol> /app/orchestrator/src/...` before assuming a fix landed.
- **One-off DB scripts**: The container has no `sqlite3` CLI. Pattern: write `scripts/<name>.cjs` using `require("/app/orchestrator/node_modules/better-sqlite3")` against `/app/data/jobs.db`, then `docker cp scripts/x.cjs job-ops:/tmp/x.cjs` and `MSYS_NO_PATHCONV=1 docker exec job-ops node /tmp/x.cjs`. **Always back up before destructive ops**: `MSYS_NO_PATHCONV=1 docker exec job-ops sh -c "cp /app/data/jobs.db /app/data/jobs.db.bak-$(date +%Y%m%d-%H%M%S)"`. Existing scripts in `scripts/*.cjs` show the conventions.
- **Don't delete `applied`/`in_progress`/`ready` jobs.** These represent user investment (tailored PDFs, sent applications, ongoing interviews). Every pruning/cleanup path in the codebase (stale-jobs, relocation filter, score-threshold auto-skip) preserves them — keep that invariant.

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
