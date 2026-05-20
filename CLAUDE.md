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

### Never delete tests to make CI green

**Deleting a test file requires explicit user permission.** Tests are the only durable signal that load-bearing behavior still works.  The May 2026 pipeline regression bundled the deletion of `job-screening.test.ts` and `relocation-filter.test.ts` next to the deletion of the code they exercised — both wiped without a discussion.  That removed the one thing that would have caught the broken pipeline before the user saw it.

Rules:
- Never run `git rm`, `Write` (overwriting with empty), or any equivalent on a `*.test.ts` / `*.spec.ts` file unless the user has explicitly told you to delete that specific test.
- If a test fails after your change, the default is to **fix the code or update the test's assertions** — not delete it.  Tests are deleted only when the branch they cover has been removed entirely AND the user agreed to the removal in the conversation.
- If you genuinely believe a test is obsolete (the feature is gone, the function is renamed beyond recognition, etc.), surface it explicitly: "This test covers X, which I'm about to remove because of Y. Are you ok with me deleting `path/to/test.ts`?" Wait for a yes.
- The same applies to deleting whole modules under `orchestrator/src/server/pipeline/` or `orchestrator/src/server/services/{job-screening,relocation-filter,resume-keywords-loader,scorer,llm-errors}.ts` — surface the intent and wait.

### Pipeline integrity gate (extra step for pipeline-touching changes)

If your change touches **anything** under `orchestrator/src/server/pipeline/`, `orchestrator/src/server/services/job-screening*`, `orchestrator/src/server/services/relocation-filter*`, or `orchestrator/src/server/services/resume-keywords-loader*`, you MUST run the pipeline guard tests before reporting done:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "<repo-path>:/app" -w /app node:22-slim \
  sh -c "cd orchestrator && ./node_modules/.bin/vitest run \
    src/server/pipeline/step-ordering.test.ts \
    src/server/services/job-screening.test.ts \
    src/server/services/relocation-filter.test.ts"
```

All three test files must pass. The ordering test is a load-bearing guard against the May 2026 regression where the relocation + anti-domain steps were silently removed; see `### Pipeline Step Ordering` below for the full story. If a test fails because you legitimately changed the contract (e.g. removed a step on purpose, added a new one), update the test AND the `### Pipeline Step Ordering` section of this file in the SAME commit — do not bypass the guard.

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

## Mandatory: Multi-User First Design

The repo serves one user today, but every change MUST behave correctly when a **different** user uploads a different resume, sets different filters, lists different languages, or lives in a different city — without code edits.  Hardcoded candidate data passes review and then silently breaks the moment a second user is onboarded.  This rule catches an entire class of subtle bugs that type-checks and unit tests miss.

**Rules**:

- **Read from runtime sources, not inline constants.**  Candidate identity → `candidate-profile.ts` (reads design resume).  Resume keywords + candidate languages → `resume-keywords-loader.ts`.  User preferences → `settings-registry.ts` (loaded via `getEffectiveSettings()`).  Do NOT inline candidate names, emails, language codes, skill tokens, project names, industry domains, or resume-specific buzzwords anywhere in production code.
- **Test fixtures must be neutral.**  Use `"Jane Doe"` / `"Test User"`, generic skills (`"backend engineer"`, `"Python"`, `"distributed systems"`), and a non-production city when the test is not specifically exercising a single-tenant predicate.  A fixture that's clearly the production user's actual name, email, or exact resume tokens is a red flag — anonymise it.  The job-screening `TPM_KEYWORDS` fixture is grandfathered for now; new fixtures use neutral data.
- **Parameterise single-tenant predicates.**  If a function logically depends on user location (Munich), language set, or domain focus, accept those as arguments with defaults — not as module-scope constants.  Acceptable interim when adding new geo / domain logic: a single named constant at the top of the file with a `TODO(multi-tenant)` marker AND a unit test that proves the predicate accepts a different shape (e.g. flips Munich → Tokyo or English+Russian → German+French and produces the inverted decision).
- **No filter should "know" the current user.**  A filter is `(job, candidateContext) → decision`.  `candidateContext` comes from the loaded resume / settings, not from constants.  If the filter has zero arguments and reads constants at module scope, it's a candidate for refactor.

**Known single-tenant debt — do NOT extend**:

- `services/relocation-filter.ts`: `MUNICH_KEYWORDS`, `ALLOWED_REGION_SUBSTRINGS`, `DISALLOWED_REGION_SUBSTRINGS` encode "Munich-based EU-resident candidate".  A Tokyo-based candidate would invert allow / disallow.  When generalising, take `homeCities` + `allowedRegions` + `disallowedRegions` parameters defaulted from a setting (`userHomeCities` / `userAllowedRegions`) and parameterise the existing tests.
- `services/job-screening.ts`: `ANTI_DOMAIN_PATTERNS` lists career classes the production candidate is not pursuing (medical billing, ERP consulting, recruiting, …).  Tolerable today because these are orthogonal to most engineering candidates, but a user with the opposite trajectory (e.g. a recruiter looking for recruiter roles) would need an inverted list.  Generalise via a per-user "career anti-pattern" setting when the second user arrives.

**Before merging, ask**:

1. Would this code work for a candidate in a different city / country?
2. Would this code work for a candidate with a different language set?
3. Would this code work for a candidate from a different industry?
4. Is any test fixture clearly the production user's actual name / email / resume token?

If (1)-(3) is "no" because the predicate is logically single-tenant: put the user-specific axis behind a parameter with a default — never a bare module-scope constant.  If (4) is "yes": anonymise the fixture.

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

### Stale Jobs Cleanup
- File: `orchestrator/src/server/services/stale-jobs-cleanup.ts` — daily 3 AM UTC scheduler.
- Removes jobs in `discovered`/`skipped`/`expired` status not updated for 90+ days. Repository helper: `deleteStaleJobs(olderThanDays)` in `orchestrator/src/server/repositories/jobs.ts`.
- **Never touches** `applied`/`in_progress`/`ready` — those represent user investment and must persist regardless of age. Preserve this invariant in any new pruning logic.
- Initialized at startup from `orchestrator/src/server/index.ts` via `initializeStaleJobsCleanup()`. Look for "Stale job cleanup scheduler started" in the logs to verify it's running after restart.

### Pipeline Step Ordering
- Order: `discoverJobs` → `preImportLiveness` → `importJobs` → `filterRelocation` → `filterAntiDomain` → `checkLiveness` → `scoreJobs` (LLM, with per-job transient-failure skip + ≥30% failure-rate pause) → `selectJobs` → `processJobs`.
- Auto-skip-below-threshold runs **inside** `scoreJobsStep` (single source of truth, reading `autoSkipScoreThreshold` with `pipelineAutoSkipBelow` as a legacy fallback). Do not add a second pass in `orchestrator.ts` — that was the May 2026 double-apply bug.
- Registered in `orchestrator/src/server/pipeline/steps/index.ts`; invoked in `orchestrator/src/server/pipeline/orchestrator.ts`.
- **Step dependency map** — useful when you're about to delete or refactor a file:
  ```
  discoverJobs        ← extractors registry
  preImportLiveness   ← HTTP HEAD (no DB)
  importJobs          ← jobsRepo.createJobs (dedup by URL)
  filterRelocation    ← jobsRepo.getUnscoredDiscoveredJobs + markJobsSkippedWithReason
                        + services/relocation-filter.ts
  filterAntiDomain    ← jobsRepo.{getUnscoredDiscoveredJobs, markJobsSkippedWithReason}
                        + services/job-screening.ts + services/resume-keywords-loader.ts
                        ← repositories/design-resume.ts
  checkLiveness       ← HTTP HEAD + jobsRepo.markExpired
  scoreJobs           ← services/scorer.ts (LLM) + services/llm-errors.ts
                        + visa-sponsors + ghost-job-detector
  selectJobs          ← location intent
  processJobs         ← services/summary.ts + projectSelection + pdf
  ```
  Deleting `markJobsSkippedWithReason` silently breaks BOTH filter steps. Deleting `resume-keywords-loader.ts` silently disables the language gate AND resume-signal gate. Deleting `llm-errors.ts` collapses the transient-vs-config distinction in the scorer.
- **Insert new filtering steps BEFORE `scoreJobs`.** Scoring is the LLM bottleneck — both cost and rate-limit constrained. Pre-filtering aggressively (liveness, relocation, anti-domain/language/resume-signal, future heuristics) saves tokens and prevents pipeline stalls when GNAI hits its $80/day cap.
- **DO NOT silently remove filter steps.** The pipeline filter chain is load-bearing — every step gates a different class of garbage. In May 2026 the `filterRelocation` + `filterAntiDomain` steps were silently dropped during a "performance" refactor, which caused irrelevant jobs (US-only, native-Polish-only, healthcare, retail, etc.) to flood Telegram and burned through the daily Anthropic budget on listings the user would never apply to. The regression took zero compile errors and zero test failures to ship because the steps were just *not called*.
- **Before deleting any file under `pipeline/` or `services/{job-screening,relocation-filter,resume-keywords-loader,scorer,llm-errors}.ts`:** run `git grep -l <basename>` and confirm every importer has been redirected to a replacement. Removal without a redirect is a silent regression — it compiles because the deleter usually also edits `steps/index.ts` and the orchestrator in the same change.
- **If you add a pipeline step, update FOUR places:**
  1. `orchestrator/src/server/pipeline/steps/index.ts` (re-export).
  2. `orchestrator/src/server/pipeline/orchestrator.ts` (call site + `ensureNotCancelled` + `persistResultSummary`).
  3. `orchestrator/src/server/pipeline/step-ordering.test.ts` (add to `REQUIRED_ORDER`).
  4. `shared/src/types/pipeline.ts` if the step contributes a new counter to `PipelineFilterMetrics` / `PipelineRunResultSummary`.
- **Guard test: `orchestrator/src/server/pipeline/step-ordering.test.ts`.** Pins the required steps and their relative order via a static read of `orchestrator.ts`. If you legitimately need to reorder or remove a step, update BOTH `REQUIRED_ORDER` in that test AND this section in the same commit. Never delete the guard. If the test seems "in the way," that means it is doing its job — read the comment at the top of the file before changing it.
- **Companion unit tests must stay green:** `job-screening.test.ts` (anti-domain + language gate + resume signal), `relocation-filter.test.ts` (Munich-or-remote predicate). These pin the heuristics that the pipeline steps wrap. If you change the underlying logic, update the tests in the same commit. Run them under Docker per the validation block above before reporting any pipeline-related change as done.
- **Filter-rate sanity bands (production, ~1500–2500 discovered/day):** if your change causes a pipeline run to drift outside these, something is broken (either you disabled a filter, the resume keyword loader is failing silently, or location intent is misrouted):
  - `filterRelocation` typically skips **30–55%** of imported jobs.
  - `filterAntiDomain` (domain + language + signal combined) typically skips **5–20%** of remaining jobs.
  - `scoreJobs` typically keeps **200–500** jobs per run; >80% of imported jobs reaching the LLM means a pre-filter is broken.
  - `scoring transientFailures` should be **0–5%** in normal operation. ≥30% triggers an automatic pipeline pause and Telegram notification with `Resume`/`Cancel` choice.
  - The Telegram run-complete summary surfaces the actual numbers from `pipeline_runs.resultSummary.filterMetrics` — eyeballing it is the fastest way to catch a regression.

### LLM error contract (scorer + downstream LLM-driven steps)
- Two error classes in `orchestrator/src/server/services/llm-errors.ts`:
  - `LlmNotConfiguredError` — CONFIG-class problem (missing key, 401/403, no provider). The orchestrator pauses the run and waits for `POST /api/pipeline/resume-scoring` (or the Telegram `▶️ Resume` button). User must fix Settings.
  - `LlmTransientError` — per-call failure (5xx, 429, garbage JSON for a single job). The step catches it, marks that one job as `suitabilityScore=null, suitabilityReason="Scoring skipped — AI temporarily unavailable …"`, and continues.
- The classifier `classifyLlmError(rawError)` is the only place this decision lives. New code that calls `LlmService.callJson` MUST route failures through it. **Do not directly throw `LlmNotConfiguredError` from inside a scoring loop on every LLM error** — that was the May 2026 regression that let a single 503 take the whole pipeline down.
- `score-jobs.ts` escalates to `LlmNotConfiguredError` ONLY when transient failures exceed `TRANSIENT_FAILURE_PAUSE_FRACTION` (30%) of attempted LLM calls AND we have at least `TRANSIENT_FAILURE_MIN_ATTEMPTS` (5) attempts. Below that threshold the run keeps going and the failures are surfaced in the Telegram completion summary as "N transient AI failures retried next run".
- The Telegram pause card auto-detects which kind of pause we're in (config vs transient) by inspecting the message text and shows different CTAs:
  - Config: `⚙️ Settings`, `▶️ Resume`, `❌ Cancel`.
  - Transient: `▶️ Resume`, `❌ Cancel` (no Settings — the user can't fix this from Settings).
- **Never re-introduce a `mockScore` fallback.** The previous version silently fabricated scores when the LLM failed; users couldn't tell real scores from fake ones, and the daily-budget protection was useless. Per-job skip + visible transient-failure count is the correct trade-off.

### Pipeline observability invariants
- `pipeline_runs.resultSummary.filterMetrics` (type: `PipelineFilterMetrics` in `shared/src/types/pipeline.ts`) is the **single source of truth** for how the funnel performed in any given run. Every filter step updates exactly one bucket. If you add a new filter, add its bucket here AND surface it in the Telegram run summary (`notifications.ts → buildCompletionMessage()`).
- The Telegram run-complete message is the **primary user-facing transparency surface** — it is the answer to "where did these strange jobs come from?". If a job slipped through unexpectedly, the user should be able to see, from the summary, which filters DID fire and which ones (relocation? anti-domain? language?) did NOT catch it.
- If the resume keyword loader fails (`screeningDegraded=true`), the run summary shows a prominent ⚠️ banner. Do not hide this in INFO-level logs or remove the banner — the user must know that screening ran with only anti-domain on.

### LocationIntent helper tolerance
- `createLocationIntentFromLegacyInputs(...)` in `shared/src/location-domain.ts` accepts BOTH naming conventions: `selectedCountry`/`country`, `cityLocations`/`searchCities`, `geoScope`/`searchScope`. This is intentional (back-compat with three older call sites), so seeing different shapes in different files is fine. **Do not "unify" by deleting one of the aliases** — that breaks `orchestrator.ts`, `select-jobs.ts`, and `run-details.ts` simultaneously. If you must consolidate, edit all three call sites in a single commit AND extend the helper's tests.

### Job Screening (anti-domain + resume signal + language gate)
- Runs as pipeline step `filterAntiDomainJobsStep` AFTER relocation filter, BEFORE LLM scoring. Source: `orchestrator/src/server/pipeline/steps/filter-anti-domain.ts`.
- Pure logic in `orchestrator/src/server/services/job-screening.ts` — exports `screenJob(job, resumeKeywords)`. No IO; safe to test without DB schema. Three gates in order:
  1. **Anti-domain** (title regex) — drops obvious mismatched careers (healthcare, billing/accounting, insurance, field sales, ERP consulting, real estate, legal, retail/service, recruiting, creative arts, fitness, …). Anti-domain wins over every other signal.
  2. **Language gate** — when the candidate's resume lists ≥1 language, skip jobs that hard-require a language NOT in the candidate's set ("Fluent in Polish", "Native German speaker", "Must speak French"). Soft mentions ("knowledge of X is a plus") deliberately do NOT fire.
  3. **Resume signal** — keep jobs that share at least one keyword with the resume's skills / experience / certifications / projects. Falls open when the resume is empty.
- Live loader: `orchestrator/src/server/services/resume-keywords-loader.ts` reads from `design_resume_documents`, 60 s cache, `clearResumeKeywordsCache()` on resume edit (mirrors `candidate-profile.ts`). Languages parsed from `sections.languages.items[].language` (reactive-resume schema) with `name` fallback (JSON-Resume schema).
- **Resume is the source of truth for the language gate.** Update the candidate's design resume to add/remove languages — do NOT introduce a separate setting. This already follows **`## Mandatory: Multi-User First Design`** — the language gate is fully driven by resume data, so it works for any candidate's language set without code changes.  Anti-domain regexes are the remaining single-tenant debt in this module.

### Relocation Filter (Munich-or-remote)
- The current user is in Munich and does NOT relocate. Pipeline auto-skips listings that aren't in the Munich metro and aren't genuinely remote.
- `orchestrator/src/server/services/relocation-filter.ts` — `requiresRelocation(job)` predicate. Hard-coded Munich-area keyword list (München / Garching / Gräfelfing / Unterföhring / Kirchheim / Germering / Aschheim / Ottobrunn / Planegg / Martinsried / Neubiberg / Haar / Ismaning / Oberhaching / Vaterstetten / Putzbrunn / Pullach / Taufkirchen) + country-only allow-list ("Germany"/"NL"/"Europe"/"DE"/...) + explicit remote markers ("Remote"/"Anywhere"/"Home Office"/"Telearbeit"/"Werk van thuis").
- `orchestrator/src/server/pipeline/steps/filter-relocation.ts` — pipeline step that demotes discovered jobs requiring relocation to `skipped` status with reason `RELOCATION_SKIP_REASON`. Marks rather than deletes so users can still inspect them in "All Jobs".
- **Country-only locations require `isRemote=true`.** A job with location="United States" and `isRemote=false/null` is treated as relocation (lazy posting at company HQ). A job with location="United States" and `isRemote=true` passes. City-level locations remain authoritative regardless of `isRemote` flag.
- Currently single-tenant (Munich is hard-coded). If you generalize to other cities, parameterize the keyword list and remove the hard-coded constants — do NOT add per-tenant settings flags until that's actually needed. See **`## Mandatory: Multi-User First Design`** above for the broader rule that governs this single-tenant carve-out — when generalising, take `homeCities` + `allowedRegions` + `disallowedRegions` parameters defaulted from settings, not new module-scope constants.

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
- **Per-purpose model mix.** Settings `modelScorer`, `modelTailoring`, `modelProjectSelection` override the default model per task. Current production mix: scoring=`claude-haiku-4-5` (cheap classification), tailoring=`claude-opus-4-6` (premium quality on the output the employer actually reads), project selection=`claude-haiku-4-5`. Resolution lives in `orchestrator/src/server/services/modelSelection.ts:resolveLlmModel()`. **Working GNAI aliases:** `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5` — full dated model IDs (`claude-sonnet-4-20250514`) do NOT work on GNAI.

### Cost Guard Rails
- **`pipelineMaxJobsToScore` setting** (default 2000) caps how many discovered jobs go through LLM scoring in a single run. Newer jobs win (sorted by `discoveredAt DESC`); the rest stay in `status='discovered'` and get scored on the next run. Source: `orchestrator/src/server/pipeline/steps/score-jobs.ts`.
- **Job description truncation** at 8 KB (`JOB_DESCRIPTION_MAX_CHARS = 8000`) before scoring AND tailoring. Cuts at word boundary, appends `... [description truncated]` marker. Same constant duplicated in `services/scorer.ts` and `services/summary.ts` — keep both in sync.
- **Concurrency tuning** (`pipeline/steps/{discover,score,process}-jobs.ts`): `DISCOVERY_CONCURRENCY=6`, `SCORING_CONCURRENCY=8`, `PROCESSING_CONCURRENCY=5`. JobSpy itself parallelises by country at `JOBSPY_COUNTRY_CONCURRENCY=3` in `extractors/jobspy/manifest.ts`. Together with mix-model these tunings move a typical run from ~2.5h to ~30-45 min and worst-case cost from ~$35 to ~$12.
- **Daily Anthropic budget on GNAI: $80/day.** Even with cap=2000 on Haiku, scoring stays under $10; tailoring on Opus adds ~$2 for top-20. Stay well below ceiling — don't blow `pipelineMaxJobsToScore` past ~5000 without re-checking budget math.

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
- **Delete one-shot scripts after they ship.** A `scripts/<name>.cjs` written to perform a one-time DB migration, retroactive filter pass, or config tweak (e.g. anything that changes settings to a specific value, replaces a specific email, advances a cursor past a specific version, applies a specific filter retroactively) MUST be deleted in the SAME commit that captures the result. Leaving applied one-shots in the repo creates ambiguity — future readers (and agents) can't tell what's still pending vs already done, and they'll occasionally re-run an already-applied script and clobber newer state.
  - **Rule of thumb to classify a script**:
    - **One-shot → DELETE after applying.** Hard-coded target values (a specific email, a specific version, a specific company slug list), addresses a specific past incident, or `apply-*` / `configure-*` / `update-*` / `restore-*` / `expand-*` / `advance-*` in the name.
    - **Tool → KEEP.** Takes inputs from arguments, is read-only against the DB, or addresses a class of recurring problems generically. Naming: `diag-*` (read-only diagnostics), `smoke-test-*` (live API checks), `validate-*` (periodic cleanups), `reset-stuck-*` (recovery), generic setup helpers (`gnai-token.sh`).
  - **Before adding a new `scripts/*.cjs`**: glance at the directory — if a similar diagnostic already exists, extend it instead of forking. If the script is genuinely one-shot, commit it WITH its deletion in a follow-up commit once the operation is confirmed applied (or skip the commit entirely if the operation is trivial enough to leave only in `git stash` / chat history).
  - **If you find dead one-shots in `scripts/` while working on something else**: surface them in chat ("I see `scripts/foo.cjs` from a past one-shot — ok to delete?") and remove on confirmation. Do not silently leave them, and do not silently delete them either.
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
