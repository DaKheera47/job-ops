---
goal: Implement Profile Compare feature — side-by-side LinkedIn profile diff with LLM scoring and quick-copy actions
version: 1.0
date_created: 2026-05-23
last_updated: 2026-05-23
owner: tamaygz
status: 'Planned'
tags: [feature]
---

![Status: Planned](https://img.shields.io/badge/status-Planned-blue)

## 1. Requirements & Constraints

### Functional Requirements (from spec)
- **REQ-001**: `/compare` route added to sidebar `NAV_LINKS` (after Resume Studio, before Tracking Inbox)
- **REQ-002**: URL input field on page; accepts LinkedIn `/in/<slug>` URLs
- **REQ-003**: Server scrapes LinkedIn URL and returns `NormalisedCompareProfile`
- **REQ-004**: Two-column, section-aligned layout — Own Profile (left) vs Other Profile (right)
- **REQ-005**: Per-section colour-coded verdict badge (`stronger` / `weaker` / `comparable`)
- **REQ-006**: ≤ 60-word LLM rationale shown per section
- **REQ-007**: Optional job picker; re-evaluates both profiles against selected job description
- **REQ-008**: "Copy over" quick action replaces Own Profile section verbatim
- **REQ-009**: "Copy over & rewrite" quick action runs LLM rewrite before merging
- **REQ-010**: Scrape result cached 30 min, scoped by tenant + URL hash
- **REQ-011**: Supports LinkedIn public profile URLs only (v1.0)
- **REQ-012**: Own Profile column refreshes after quick action completes
- **REQ-013**: "Clear comparison" resets right column without page reload

### Security Requirements
- **SEC-001**: URL validated server-side against `^https://www\.linkedin\.com/in/[a-zA-Z0-9_-]+$` before scraping
- **SEC-002**: Raw LinkedIn HTML never forwarded to client
- **SEC-003**: Scraped content sanitised (HTML stripped, fields truncated) before LLM or storage
- **SEC-004**: Apply endpoint requires authenticated user (401 if not)
- **SEC-005**: Compare cache scoped by tenant — no cross-tenant reads
- **SEC-006**: LLM prompt excludes other user's email, phone, and contact identifiers

### Constraints
- **CON-001**: LinkedIn public profiles only in v1.0
- **CON-002**: Scraping via existing Camoufox (`scripts/camoufox-fetch.mjs`) or plain HTTPS `fetch`; no new scraping libraries
- **CON-003**: LLM evaluation via existing `orchestrator/src/server/services/llm/` and `modelSelection.ts`
- **CON-004**: Copy actions target local Design Resume only (`services/design-resume/index.ts`); RxResume write is out of scope
- **CON-005**: Compare does not block main pipeline
- **CON-006**: No database persistence; ephemeral in-memory cache (TTL 30 min)

### Guidelines
- **GUD-001**: Use `PageHeader` and `layout.tsx` for page chrome
- **GUD-002**: Reuse `ScoreIndicator` / `ScoreRing` for verdict badges
- **GUD-003**: Stream section evaluations via SSE using `orchestrator/src/server/infra/sse.ts` helpers
- **GUD-004**: All API responses follow `{ ok, data/error, meta.requestId }` contract
- **GUD-005**: Server-side logging via shared `logger` with `requestId`; no `console.log`
- **GUD-006**: LLM rewrite prompt uses `AppSettings.writingStyle` for tonal context

---

## 2. Implementation Phases

### Phase 1 — Shared Types

- **GOAL-001**: Define and export all new TypeScript types in the shared package so they are available to both client and server.

| Task     | Description                                                                                                                                      | Completed | Date |
|----------|--------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-001 | Create `shared/src/types/compare.ts` — define `NormalisedCompareProfile`, `CompareExperienceItem`, `CompareEducationItem`, `CompareSkillItem`, `CompareCertificationItem`, `CompareProjectItem`, `CompareLanguageItem`, `CompareAwardItem`, `CompareSectionKey`, `SectionVerdict`, `SectionEvaluation`, `CompareResult` exactly as specified in spec §4.1 | | |
| TASK-002 | Export new types from `shared/src/types/index.ts` (or the appropriate barrel file) so they are accessible via `@shared/types` | | |
| TASK-003 | Run `npm run check:types:shared` — confirm zero new type errors | | |

---

### Phase 2 — Server: Compare Service Layer

- **GOAL-002**: Implement the server-side `compare/` service with scraping, normalisation, LLM evaluation, TTL cache, and apply logic.

| Task     | Description                                                                                                                                                                 | Completed | Date |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-004 | Create `orchestrator/src/server/services/compare/cache.ts` — in-memory Map keyed by `${tenantId}::${urlHash}` with 30-min TTL using `Date.now()`; export `getCached`, `setCached`, `clearExpired` | | |
| TASK-005 | Create `orchestrator/src/server/services/compare/scraper.ts` — `scrapeLinkedInProfile(url: string): Promise<string>` that (1) tries Camoufox binary via `scripts/camoufox-fetch.mjs` spawn with timeout, (2) falls back to `fetch` with a realistic `User-Agent`; throws `AppError` with code `UPSTREAM_ERROR` on 4xx/5xx/bot-block | | |
| TASK-006 | Create `orchestrator/src/server/services/compare/normaliser.ts` — `normaliseLinkedInHtml(html: string, sourceUrl: string): NormalisedCompareProfile`; parses JSON-LD `<script type="application/ld+json">` tags and falls back to CSS-selector heuristics; strips all HTML from text fields via regex; truncates `description` ≤ 800 chars, `summary` ≤ 600 chars; drops `email`, `phone`, `connections` | | |
| TASK-007 | Create `orchestrator/src/server/services/compare/evaluator.ts` — `evaluateSections(ownProfile: ResumeProfile, otherProfile: NormalisedCompareProfile, jobDescription?: string): AsyncGenerator<SectionEvaluation>`; iterates sections, calls `createConfiguredLlmService` for each, emits `SectionEvaluation` objects; clamps unexpected verdict strings to `comparable` with a warning log | | |
| TASK-008 | Create `orchestrator/src/server/services/compare/apply.ts` — `applySection(section: CompareSectionKey, action: 'copy' \| 'copy_rewrite', otherProfile: NormalisedCompareProfile): Promise<void>`; for `copy` directly patches the Design Resume via the `updateDesignResume` function in `services/design-resume/index.ts`; for `copy_rewrite` first calls `createConfiguredLlmService` with the `writingStyle` setting, then patches | | |
| TASK-009 | Create `orchestrator/src/server/services/compare/index.ts` — re-exports `scrapeLinkedInProfile`, `normaliseLinkedInHtml`, `evaluateSections`, `applySection`, `getCached`, `setCached` | | |

---

### Phase 3 — Server: API Routes

- **GOAL-003**: Expose three new REST/SSE endpoints under `/api/compare` and register them in the API router.

| Task     | Description                                                                                                                                                                                                                 | Completed | Date |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-010 | Create `orchestrator/src/server/api/routes/compare.ts` — define `compareRouter = Router()` with three handlers:<br>• `POST /scrape` — validates URL regex, checks cache, calls `scrapeLinkedInProfile` + `normaliseLinkedInHtml`, sets cache, returns `ok(res, profile)`<br>• `POST /evaluate` — looks up cache, calls `evaluateSections` as async generator, sets up SSE via `setupSse` + `writeSseData`, emits `section_eval` events + optional `overall_scores` + `done`; uses `startSseHeartbeat`<br>• `POST /apply` — validates body, looks up cache, calls `applySection`, returns `ok(res, { updatedSection })` | | |
| TASK-011 | Add URL canonicalisation helper in `compare.ts` route: strip trailing slash, remove query params, normalise `http://` to `https://` before regex check | | |
| TASK-012 | Register route in `orchestrator/src/server/api/routes.ts`: add `import { compareRouter } from "./routes/compare"` and `apiRouter.use("/compare", compareRouter)` | | |

---

### Phase 4 — Client: API Client Module

- **GOAL-004**: Add typed client functions for all three compare endpoints, matching the pattern used by `ghostwriter.ts` and `jobs.ts`.

| Task     | Description                                                                                                                                                                   | Completed | Date |
|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-013 | Create `orchestrator/src/client/api/compare.ts` — export:<br>• `scrapeProfile(url: string): Promise<NormalisedCompareProfile>` — calls `fetchApi<NormalisedCompareProfile>('/compare/scrape', { method: 'POST', body: { url } })`<br>• `streamEvaluate(url: string, jobId?: string): AsyncGenerator<SectionEvaluation \| OverallScores>` — calls `streamSseEvents` on `/compare/evaluate`<br>• `applySection(url: string, section: CompareSectionKey, action: 'copy' \| 'copy_rewrite'): Promise<{ updatedSection: string }>` — calls `fetchApi` on `/compare/apply` | | |
| TASK-014 | Export new functions from `orchestrator/src/client/api/index.ts` | | |

---

### Phase 5 — Client: Navigation & Routing

- **GOAL-005**: Wire `/compare` into the sidebar and React Router.

| Task     | Description                                                                                                                                                                                         | Completed | Date |
|----------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-015 | In `orchestrator/src/client/components/navigation.ts`: add `import { GitCompareArrows } from "lucide-react"` and insert the nav entry `{ to: "/compare", label: "Compare", icon: GitCompareArrows, activePaths: ["/compare"] }` after the Resume Studio entry (`/design-resume`) and before the Tracking Inbox entry (`/tracking-inbox`) | | |
| TASK-016 | In `orchestrator/src/client/App.tsx`: add `import { ComparePage } from "./pages/ComparePage"` and insert `<Route path="/compare" element={<ComparePage />} />` inside the `<Routes>` block alongside other top-level routes | | |

---

### Phase 6 — Client: ComparePage UI

- **GOAL-006**: Build the full `ComparePage` with URL input, two-column comparison layout, verdict badges, job picker, and quick actions.

| Task     | Description                                                                                                                                                                                                    | Completed | Date |
|----------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-017 | Create `orchestrator/src/client/pages/ComparePage.tsx` — page skeleton using `PageHeader` (icon: `GitCompareArrows`, title: "Compare", subtitle: "Score your profile against another LinkedIn profile") from `layout.tsx`; show Own Profile left column on mount using a `GET /api/profile` fetch | | |
| TASK-018 | Add `CompareUrlInput` sub-component (inline within the file or in `pages/compare/`) — controlled text input, client-side validation via regex before calling `scrapeProfile()`; shows inline error on invalid URL; shows loading skeleton while scraping | | |
| TASK-019 | Add `CompareSectionRow` sub-component — accepts `sectionKey: CompareSectionKey`, `ownContent: ReactNode`, `otherContent: ReactNode`, `evaluation?: SectionEvaluation`; renders a full-width row with two equal columns; shows `SectionVerdictBadge` in the header when evaluation is present | | |
| TASK-020 | Add `SectionVerdictBadge` sub-component — accepts `verdict: SectionVerdict`; renders a coloured badge (`stronger` = green, `weaker` = red, `comparable` = neutral/muted) plus a tooltip containing the LLM rationale text | | |
| TASK-021 | Add `CompareQuickActions` sub-component — shown on each Other Profile section; contains "Copy over" button and "Copy over & rewrite" button; buttons disabled while any apply operation is in flight; calls `applySection()` on click and shows a success toast via `sonner` on completion | | |
| TASK-022 | Add `CompareJobPicker` sub-component — a `<select>` or shadcn `<Combobox>` populated via `GET /api/jobs?status=ready`; shows "Compare against a job (optional)" as placeholder; on selection, calls `streamEvaluate(url, jobId)` and updates section evaluations and displays per-profile overall suitability scores (0–100) | | |
| TASK-023 | Wire up SSE evaluation stream in `ComparePage`: on successful scrape, immediately start `streamEvaluate(url)`; update `evaluations` state progressively as each `section_eval` SSE event arrives; show a spinner per section until its evaluation arrives | | |
| TASK-024 | Add "Clear comparison" button in the page header `actions` prop — resets `otherProfile`, `evaluations`, and URL input state; right column reverts to URL input prompt | | |
| TASK-025 | Handle "missing section" edge case: if a section exists in Other Profile but not in Own Profile, render a "Missing from your profile" badge in the left column; still enable copy action | | |
| TASK-026 | Handle RxResume-only profile (no local Design Resume) — check `GET /api/profile/status`; if `exists === false` for design resume, disable all copy action buttons with a tooltip: "Create a local Resume Studio first to copy sections" | | |

---

### Phase 7 — Tests

- **GOAL-007**: Achieve adequate test coverage across service unit tests, API route integration tests, and React component tests.

| Task     | Description                                                                                                                                                                                                            | Completed | Date |
|----------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------|------|
| TASK-027 | Create `orchestrator/src/server/services/compare/__fixtures__/` — add `linkedin-profile-fixture.html` with representative LinkedIn profile HTML including JSON-LD, experience, education, and skills sections | | |
| TASK-028 | Create `orchestrator/src/server/services/compare/normaliser.test.ts` — unit tests: (1) correctly maps fixture HTML to `NormalisedCompareProfile`; (2) strips HTML from text fields; (3) drops email and phone fields; (4) truncates `description` to ≤ 800 chars; (5) returns empty arrays for missing sections | | |
| TASK-029 | Create `orchestrator/src/server/services/compare/cache.test.ts` — unit tests: (1) returns cached result on second call within TTL; (2) re-fetches / returns null after TTL expires; (3) scopes by tenant key | | |
| TASK-030 | Create `orchestrator/src/server/services/compare/scraper.test.ts` — unit tests: (1) surfaces `AppError` with `UPSTREAM_ERROR` code on 999 response; (2) falls back to plain `fetch` when Camoufox binary is absent; (3) calls Camoufox first when available | | |
| TASK-031 | Create `orchestrator/src/server/api/routes/compare.test.ts` — integration tests: (1) `POST /api/compare/scrape` returns 400 for non-LinkedIn URL; (2) `POST /api/compare/scrape` returns 422 when normaliser produces empty data; (3) `POST /api/compare/apply` returns 404 when cache is empty; (4) `POST /api/compare/apply` with `copy_rewrite` calls LLM service and patches Design Resume; (5) returns 401 when unauthenticated | | |
| TASK-032 | Create `orchestrator/src/client/pages/ComparePage.test.tsx` — component tests using MSW to mock `/api/compare/*`: (1) renders Own Profile left column without Other Profile on initial load; (2) shows validation error for invalid URL without making API call; (3) renders verdict badges with correct colour classes after evaluation; (4) disables copy buttons while apply is in flight | | |

---

### Phase 8 — CI Validation

- **GOAL-008**: Confirm all CI-parity checks pass with no regressions.

| Task     | Description                                                                                      | Completed | Date |
|----------|--------------------------------------------------------------------------------------------------|-----------|------|
| TASK-033 | Run `./orchestrator/node_modules/.bin/biome ci .` — fix any lint or format issues in new files  | | |
| TASK-034 | Run `npm run check:types:shared` — zero errors                                                   | | |
| TASK-035 | Run `npm --workspace orchestrator run check:types` — zero errors                                 | | |
| TASK-036 | Run `npm --workspace orchestrator run build:client` — build succeeds                             | | |
| TASK-037 | Run `npm --workspace orchestrator run test:run` — all tests pass (rebuild `better-sqlite3` first if ABI mismatch: `npm --workspace orchestrator rebuild better-sqlite3`) | | |

---

## 3. Alternatives

- **ALT-001**: Use LinkedIn's unofficial People Search API or a third-party enrichment service (e.g. Proxycurl) — Rejected because it introduces a paid third-party dependency and violates CON-002 (no new libraries without approval).
- **ALT-002**: Client-side scraping via a browser extension or iframe — Rejected because CORS blocks LinkedIn fetches from the browser, and it would expose raw HTML to the client (violates SEC-002).
- **ALT-003**: Persist compare sessions to SQLite — Rejected because compare data is ephemeral (CON-006) and the additional schema migration complexity is unjustified for a cache.
- **ALT-004**: Single-prompt "evaluate all sections at once" LLM call — Rejected because it exceeds context windows for large profiles and prevents progressive SSE streaming, degrading perceived performance.
- **ALT-005**: Write copy actions back to RxResume via its API — Rejected because the current RxResume integration is read-only and write scopes are not configured (CON-004).

---

## 4. Dependencies

- **DEP-001**: `scripts/camoufox-fetch.mjs` — optional Camoufox binary; scraper gracefully degrades if absent
- **DEP-002**: `orchestrator/src/server/services/llm/` + `modelSelection.ts` — LLM client for section evaluation and rewrite
- **DEP-003**: `orchestrator/src/server/services/design-resume/index.ts` — `updateDesignResume` / patch functions for apply actions
- **DEP-004**: `orchestrator/src/server/services/profile.ts` — `getProfile()` for own profile data
- **DEP-005**: `orchestrator/src/server/infra/sse.ts` — `setupSse`, `writeSseData`, `startSseHeartbeat`
- **DEP-006**: `orchestrator/src/server/infra/errors.ts` — `AppError`, `badRequest`, `notFound`, `conflict`
- **DEP-007**: `orchestrator/src/server/infra/logger.ts` — structured logging
- **DEP-008**: `orchestrator/src/server/infra/http.ts` — `ok`, `fail` response helpers
- **DEP-009**: `orchestrator/src/client/api/core.ts` — `fetchApi`, `streamSseEvents`
- **DEP-010**: `orchestrator/src/client/lib/sse.ts` — `subscribeToEventSource`
- **DEP-011**: `orchestrator/src/client/components/layout.tsx` — `PageHeader`
- **DEP-012**: `orchestrator/src/client/components/ScoreIndicator.tsx` / `ScoreRing.tsx` — verdict badge primitives
- **DEP-013**: `shared/src/types/settings.ts` — `ResumeProfile`, `AppSettings`
- **DEP-014**: `shared/src/types/api.ts` — `ApiResponse` contract
- **DEP-015**: `orchestrator/src/server/tenancy/context.ts` — `getActiveTenantId()` for cache scoping
- **DEP-016**: `orchestrator/src/server/services/writing-style.ts` — writing style context for rewrite prompt
- **DEP-017**: Node.js built-in `crypto` — `createHash('sha256')` for URL-keyed cache

---

## 5. Files

### New Files

| File | Status | What changes |
|------|--------|--------------|
| `shared/src/types/compare.ts` | created | All new shared types: `NormalisedCompareProfile`, `SectionEvaluation`, `CompareResult`, etc. |
| `orchestrator/src/server/services/compare/index.ts` | created | Re-export barrel |
| `orchestrator/src/server/services/compare/cache.ts` | created | In-memory TTL cache, tenant-scoped |
| `orchestrator/src/server/services/compare/scraper.ts` | created | Camoufox + `fetch` fallback LinkedIn scraper |
| `orchestrator/src/server/services/compare/normaliser.ts` | created | HTML → `NormalisedCompareProfile` parser |
| `orchestrator/src/server/services/compare/evaluator.ts` | created | LLM section-level async generator evaluator |
| `orchestrator/src/server/services/compare/apply.ts` | created | Copy / copy-rewrite quick-action merge service |
| `orchestrator/src/server/services/compare/__fixtures__/linkedin-profile-fixture.html` | created | Test fixture HTML for normaliser tests |
| `orchestrator/src/server/services/compare/normaliser.test.ts` | created | Unit tests for normaliser |
| `orchestrator/src/server/services/compare/cache.test.ts` | created | Unit tests for cache |
| `orchestrator/src/server/services/compare/scraper.test.ts` | created | Unit tests for scraper |
| `orchestrator/src/server/api/routes/compare.ts` | created | Express router with `/scrape`, `/evaluate`, `/apply` |
| `orchestrator/src/server/api/routes/compare.test.ts` | created | Integration tests for compare routes |
| `orchestrator/src/client/api/compare.ts` | created | Typed client functions: `scrapeProfile`, `streamEvaluate`, `applySection` |
| `orchestrator/src/client/pages/ComparePage.tsx` | created | Full Compare page |
| `orchestrator/src/client/pages/ComparePage.test.tsx` | created | Component tests |

### Modified Files

| File | Status | What changes |
|------|--------|--------------|
| `shared/src/types/index.ts` | modified | Export `compare.ts` types |
| `orchestrator/src/server/api/routes.ts` | modified | Import `compareRouter` and add `apiRouter.use("/compare", compareRouter)` |
| `orchestrator/src/client/api/index.ts` | modified | Re-export `compare.ts` functions |
| `orchestrator/src/client/components/navigation.ts` | modified | Add `GitCompareArrows` import and Compare `NavLink` entry |
| `orchestrator/src/client/App.tsx` | modified | Import `ComparePage` and add `<Route path="/compare" ...>` |

---

## 6. Testing

- **TEST-001**: `normaliser.test.ts` — fixture HTML maps to `NormalisedCompareProfile` with all seven section arrays present and non-null ✓/✗
- **TEST-002**: `normaliser.test.ts` — output contains no `email`, `phone`, or `connections` fields anywhere in the object ✓/✗
- **TEST-003**: `normaliser.test.ts` — `description` fields are ≤ 800 chars and `summary` is ≤ 600 chars ✓/✗
- **TEST-004**: `cache.test.ts` — second call with same key within TTL returns cached object without re-invoke ✓/✗
- **TEST-005**: `cache.test.ts` — call after TTL expiry (mock `Date.now`) returns null ✓/✗
- **TEST-006**: `scraper.test.ts` — `AppError` with code `UPSTREAM_ERROR` thrown when mocked `fetch` returns status 999 ✓/✗
- **TEST-007**: `compare.test.ts` (route) — `POST /api/compare/scrape` with `url: "https://example.com"` returns `{ ok: false, error: { code: "INVALID_REQUEST" } }` and HTTP 400 ✓/✗
- **TEST-008**: `compare.test.ts` (route) — `POST /api/compare/apply` with empty cache returns HTTP 404 ✓/✗
- **TEST-009**: `compare.test.ts` (route) — unauthenticated request to any endpoint returns HTTP 401 ✓/✗
- **TEST-010**: `ComparePage.test.tsx` — Own Profile left column renders on mount without a scrape URL entered ✓/✗
- **TEST-011**: `ComparePage.test.tsx` — submitting `"not-a-url"` does not call `POST /api/compare/scrape` (MSW handler asserts no request received) ✓/✗
- **TEST-012**: `ComparePage.test.tsx` — after mock `section_eval` SSE events, all verdict badges are present in the DOM with correct `data-verdict` attribute values ✓/✗
- **TEST-013**: `ComparePage.test.tsx` — "Copy over" button has `disabled` attribute while the `applySection` mock is pending ✓/✗
- **TEST-014**: CI — `biome ci .` exits 0 ✓/✗
- **TEST-015**: CI — `check:types:shared` exits 0 ✓/✗
- **TEST-016**: CI — `orchestrator check:types` exits 0 ✓/✗
- **TEST-017**: CI — `orchestrator build:client` exits 0 ✓/✗
- **TEST-018**: CI — `orchestrator test:run` exits 0 (all tests pass) ✓/✗

---

## 7. Risks & Assumptions

- **RISK-001**: LinkedIn may return a login-wall page (HTTP 200 with login form) rather than a 4xx — normaliser would produce an empty or near-empty profile. Mitigation: in `normaliser.ts`, check that at least `basics.name` is non-empty; if not, throw `UNPROCESSABLE_ENTITY`.
- **RISK-002**: LinkedIn HTML structure changes without notice, breaking the normaliser. Mitigation: the normaliser tests use a fixture — update fixture and normaliser in lockstep when breakage is detected. No automated LinkedIn HTML version pinning is needed in v1.0.
- **RISK-003**: Camoufox binary may not be present in all deployment environments (e.g. production Docker image). Mitigation: scraper falls back to plain `fetch`; document that Camoufox is optional.
- **RISK-004**: LLM context window may be exceeded for profiles with many sections or large job descriptions. Mitigation: `normaliser.ts` truncates per-field; `evaluator.ts` evaluates sections individually rather than all at once.
- **RISK-005**: In-memory cache is not shared across multiple Node.js processes (e.g. scaled orchestrator). Mitigation: acceptable for v1.0 given typical single-instance deployment; noted for future Redis upgrade.
- **ASSUMPTION-001**: The Design Resume update path in `services/design-resume/index.ts` accepts partial section patches via an existing function — verify the exact function signature before implementing `apply.ts`.
- **ASSUMPTION-002**: `getActiveTenantId()` is available in the context of all three route handlers (it is used elsewhere in the codebase).
- **ASSUMPTION-003**: `streamSseEvents` in `orchestrator/src/client/api/core.ts` accepts a `POST` body — verify against its signature before implementing `streamEvaluate`.
- **ASSUMPTION-004**: `lucide-react` already installed in the orchestrator workspace includes `GitCompareArrows` — verify the icon exists before TASK-015.

---

## 8. Related Specifications / Further Reading

- [`spec/spec-feature-compare.md`](../spec/spec-feature-compare.md) — full feature specification (requirements, data contracts, edge cases, AC)
- [`shared/src/types/design-resume.ts`](../shared/src/types/design-resume.ts) — RxResume V5 schema (section types)
- [`shared/src/types/settings.ts`](../shared/src/types/settings.ts) — `ResumeProfile`, `AppSettings`, writing style
- [`orchestrator/src/server/services/scorer.ts`](../orchestrator/src/server/services/scorer.ts) — LLM scoring pattern to mirror in `evaluator.ts`
- [`orchestrator/src/server/services/ghostwriter.ts`](../orchestrator/src/server/services/ghostwriter.ts) — SSE streaming pattern to mirror
- [`orchestrator/src/server/infra/sse.ts`](../orchestrator/src/server/infra/sse.ts) — `setupSse`, `writeSseData`, `startSseHeartbeat`
- [`orchestrator/src/server/api/routes.ts`](../orchestrator/src/server/api/routes.ts) — API router registration pattern
- [`orchestrator/src/client/api/ghostwriter.ts`](../orchestrator/src/client/api/ghostwriter.ts) — client SSE consumer pattern
- [`orchestrator/src/client/components/navigation.ts`](../orchestrator/src/client/components/navigation.ts) — `NAV_LINKS` definition
- [`scripts/camoufox-fetch.mjs`](../scripts/camoufox-fetch.mjs) — Camoufox binary harness
- [`AGENTS.md`](../AGENTS.md) — API contract, logging, multi-tenancy, and CI-parity rules

> **Hand-off**: Pass this plan to **`blueprint-mode`** or **`software-engineer-agent-v1`** for execution.
