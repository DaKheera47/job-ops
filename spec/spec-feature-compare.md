---
title: Profile Compare Feature
version: 1.0
date_created: 2026-05-23
owner: tamaygz
tags: [feature, design, process, app]
---

# Introduction

The **Compare** feature allows a logged-in user to paste the URL of another person's LinkedIn profile, scrape and normalise it into the internal `ResumeProfile` format, and display a side-by-side, section-level diff against their own profile. An optional job can be selected to score both profiles against the same role. Quick-action controls let the user copy individual sections from the other profile—verbatim or via LLM rewrite—directly into their own local resume.

---

## 1. Purpose & Scope

### Purpose

Provide a self-serve benchmarking tool so users can understand how their profile compares to peers or target candidates, identify concrete gaps, and action improvements in one workflow without leaving the app.

### Scope

| In scope | Out of scope |
|---|---|
| LinkedIn public profile scraping | Scraping profiles that require login |
| Normalising scraped data into `ResumeProfile` | Automatic crawling or batch comparison |
| Side-by-side section comparison UI | Exporting comparison reports |
| Per-section LLM strength evaluation | Syncing changes back to RxResume |
| Optional job-suitability scoring for both profiles | Comparing more than two profiles simultaneously |
| "Copy over" and "Copy over & rewrite" quick actions | Modifying the other user's scraped data |
| Dedicated `/compare` route in the sidebar | |

### Intended Audience

Engineers implementing the feature, QA testers, and product reviewers.

---

## 2. Definitions

| Term | Definition |
|---|---|
| **Own Profile** | The `ResumeProfile` returned by `GET /api/profile` for the authenticated user, sourced from either the local Design Resume or RxResume. |
| **Other Profile** | The `ResumeProfile` derived by scraping and normalising a third-party LinkedIn public profile URL. |
| **Normalised Profile** | A `ResumeProfile`-shaped object derived from raw scraped HTML/JSON. |
| **Section** | A top-level key under `ResumeProfile.sections` (e.g., `experience`, `skills`, `education`, `projects`, `summary`) or the `basics` block. |
| **Section Score** | An LLM-assigned strength rating (`stronger` \| `weaker` \| `comparable`) for each section, optionally relative to a job description. |
| **Quick Action** | A per-section user-initiated operation: *Copy over* or *Copy over & rewrite*. |
| **Copy over** | Replace the matching section in the user's local Design Resume with the verbatim scraped content from the Other Profile. |
| **Copy over & rewrite** | Copy the section from the Other Profile, then invoke the LLM to rewrite it in the user's established voice/style before merging it. |
| **Job Context** | An optional selected job whose `jobDescription` is passed to the LLM scorer so that both profiles are evaluated relative to that specific role. |
| **Camoufox** | The headless browser harness already used by the `ukvisajobs` extractor (`scripts/camoufox-fetch.mjs`) that can fetch pages behind bot-mitigation. |
| **JobSpy** | The Python-based multi-board scraper extractor (`extractors/jobspy/`) which already includes LinkedIn as a supported site source. |
| **RxResume V5** | The resume schema used by Reactive Resume, defined in `shared/src/types/design-resume.ts`. |
| **Design Resume** | The local resume editor stored in SQLite, served via `orchestrator/src/server/services/design-resume/`. |
| **Tenant** | A single user/workspace context. All compare state is scoped per tenant. |
| **LLM** | Large Language Model accessed via the app's existing `llm/` service layer (`orchestrator/src/server/services/llm/`). |

---

## 3. Requirements, Constraints & Guidelines

### Functional Requirements

- **REQ-001**: The feature must be accessible at the route `/compare`, listed as a top-level entry in `NAV_LINKS` in `orchestrator/src/client/components/navigation.ts`.
- **REQ-002**: The page must present a URL input field accepting a LinkedIn public profile URL.
- **REQ-003**: On submission, the server must scrape the LinkedIn profile at the provided URL and return a `NormalisedCompareProfile` object.
- **REQ-004**: The page must display the Own Profile and the Other Profile in a two-column, section-aligned layout.
- **REQ-005**: The UI must visually distinguish which profile is stronger in each section using colour-coded indicators (`stronger`, `weaker`, `comparable`).
- **REQ-006**: Each section comparison must display a brief LLM-generated plain-text rationale (≤ 60 words) explaining the strength verdict.
- **REQ-007**: The user must be able to optionally select a job from their existing job list to use as the scoring context; when selected, both profiles are re-evaluated relative to that job description.
- **REQ-008**: Each section in the Other Profile column must expose a "Copy over" action that replaces the corresponding section in the user's local Design Resume.
- **REQ-009**: Each section in the Other Profile column must expose a "Copy over & rewrite" action that copies the section content and then rewrites it using the LLM before merging it into the user's local Design Resume.
- **REQ-010**: The scraping result must be cached server-side per tenant with a TTL of 30 minutes, keyed by URL hash.
- **REQ-011**: The feature must work with LinkedIn public profile URLs (format: `https://www.linkedin.com/in/<slug>`).
- **REQ-012**: After a quick action is applied, the Own Profile column must refresh to reflect the updated section.
- **REQ-013**: The user must be able to clear the comparison and enter a new URL without a page reload.

### Security Requirements

- **SEC-001**: The server must validate that the provided URL matches the pattern `https://www.linkedin.com/in/[a-zA-Z0-9_-]+` before initiating any scrape request.
- **SEC-002**: The scrape URL must be fetched server-side only; the raw LinkedIn HTML/JSON must never be forwarded to the client.
- **SEC-003**: Scraped content must be sanitised (HTML stripped, length-truncated per field) before being stored or sent to the LLM.
- **SEC-004**: Copy-over actions that modify the local Design Resume must require the user to be authenticated (401 if not).
- **SEC-005**: The comparison cache must be scoped by tenant so that one user cannot read another user's scraped profile data.
- **SEC-006**: The LLM prompt must not include the other user's email, phone number, or other directly identifying contact information.

### Constraints

- **CON-001**: The feature must only support LinkedIn public profiles in v1.0; other profile platforms (GitHub, Indeed, etc.) are deferred.
- **CON-002**: Scraping must use the existing server-side Camoufox or JobSpy infrastructure; no new scraping library may be introduced.
- **CON-003**: Section-level LLM evaluation must use the existing `llm/` service layer and respect the user's configured LLM provider/model.
- **CON-004**: Quick actions that modify the user's resume must only target the local Design Resume; modifying RxResume is out of scope.
- **CON-005**: The feature must not block the main pipeline; scraping and LLM scoring run independently and asynchronously.
- **CON-006**: Compare sessions are ephemeral—they are not persisted to the database beyond the cache TTL.

### Guidelines

- **GUD-001**: Use the existing `PageHeader` and `layout.tsx` components for consistent navigation chrome.
- **GUD-002**: Reuse `ScoreIndicator` / `ScoreRing` components where applicable for strength badges.
- **GUD-003**: SSE (`orchestrator/src/server/infra/sse.ts`) should be used for streaming LLM section evaluations so the UI progressively reveals results.
- **GUD-004**: Follow the API response contract `{ ok, data/error, meta.requestId }` defined in `shared/src/types/api.ts` and `AGENTS.md`.
- **GUD-005**: Log structured objects via the shared logger with `requestId` and tenant context; no raw `console.log`.
- **GUD-006**: The rewrite prompt should reference the user's existing writing style settings (`writingStyle` in `AppSettings`) for tonal consistency.

---

## 4. Interfaces & Data Contracts

### 4.1 New Shared Types

```typescript
// shared/src/types/compare.ts

/**
 * A normalised, sanitised profile derived from scraping a third-party LinkedIn URL.
 * Intentionally omits contact information (email, phone) for privacy.
 */
export interface NormalisedCompareProfile {
  sourceUrl: string;           // Canonicalised LinkedIn /in/<slug> URL
  fetchedAt: string;           // ISO-8601 timestamp
  basics: {
    name: string;
    headline: string;
    location: string;
    summary: string;
  };
  sections: {
    experience: CompareExperienceItem[];
    education: CompareEducationItem[];
    skills: CompareSkillItem[];
    certifications: CompareCertificationItem[];
    projects: CompareProjectItem[];
    languages: CompareLanguageItem[];
    awards: CompareAwardItem[];
    // No email/phone; no references
  };
}

export interface CompareExperienceItem {
  company: string;
  position: string;
  period: string;
  description: string;
}

export interface CompareEducationItem {
  school: string;
  degree: string;
  area: string;
  period: string;
}

export interface CompareSkillItem {
  name: string;
  keywords: string[];
}

export interface CompareCertificationItem {
  title: string;
  issuer: string;
  date: string;
}

export interface CompareProjectItem {
  name: string;
  period: string;
  description: string;
}

export interface CompareLanguageItem {
  language: string;
  fluency: string;
}

export interface CompareAwardItem {
  title: string;
  awarder: string;
  date: string;
}

/** Keys that can be compared between profiles */
export type CompareSectionKey =
  | "basics"
  | "experience"
  | "education"
  | "skills"
  | "certifications"
  | "projects"
  | "languages"
  | "awards";

export type SectionVerdict = "stronger" | "weaker" | "comparable";

/** LLM evaluation result for one section */
export interface SectionEvaluation {
  section: CompareSectionKey;
  verdict: SectionVerdict;
  rationale: string;  // ≤ 60 words plain text
}

/** Full comparison result */
export interface CompareResult {
  ownProfile: ResumeProfile;
  otherProfile: NormalisedCompareProfile;
  evaluations: SectionEvaluation[];
  jobId?: string;           // null if no job context was selected
  jobTitle?: string;
  overallOwnScore?: number; // 0-100, only present when jobId is set
  overallOtherScore?: number;
}
```

### 4.2 API Routes

#### `POST /api/compare/scrape`

Initiates scraping of the provided LinkedIn URL and returns the normalised profile.

**Request body:**
```json
{
  "url": "https://www.linkedin.com/in/some-user"
}
```

**Response (success `200`):**
```json
{
  "ok": true,
  "data": { /* NormalisedCompareProfile */ },
  "meta": { "requestId": "..." }
}
```

**Error codes:**

| HTTP | Code | Condition |
|---|---|---|
| `400` | `INVALID_REQUEST` | URL is missing or does not match LinkedIn `/in/` pattern |
| `422` | `UNPROCESSABLE_ENTITY` | Scrape succeeded but normalisation produced no meaningful data |
| `502` | `UPSTREAM_ERROR` | LinkedIn returned a non-200 response or bot-blocked |
| `500` | `INTERNAL_ERROR` | Unexpected server failure |

#### `POST /api/compare/evaluate`

Runs LLM section-level evaluation for a previously scraped profile, streamed via SSE.

**Request body:**
```json
{
  "otherProfileUrl": "https://www.linkedin.com/in/some-user",
  "jobId": "optional-job-id-or-null"
}
```

**SSE events emitted:**

| Event name | Payload |
|---|---|
| `section_eval` | `SectionEvaluation` for each section as completed |
| `overall_scores` | `{ ownScore: number, otherScore: number }` (only when `jobId` is present) |
| `done` | `{}` |
| `error` | `{ code, message }` |

#### `POST /api/compare/apply`

Applies a quick action to copy a section from the Other Profile into the user's local Design Resume.

**Request body:**
```json
{
  "otherProfileUrl": "https://www.linkedin.com/in/some-user",
  "section": "experience",
  "action": "copy" | "copy_rewrite"
}
```

**Response (success `200`):**
```json
{
  "ok": true,
  "data": { "updatedSection": "experience" },
  "meta": { "requestId": "..." }
}
```

**Error codes:**

| HTTP | Code | Condition |
|---|---|---|
| `400` | `INVALID_REQUEST` | Missing fields or unknown `section` / `action` |
| `404` | `NOT_FOUND` | Cached profile for URL not found (expired or never fetched) |
| `409` | `CONFLICT` | Design Resume is locked by another operation |
| `500` | `INTERNAL_ERROR` | LLM rewrite or resume merge failed |

### 4.3 Navigation Entry

A new entry must be added to `NAV_LINKS` in `orchestrator/src/client/components/navigation.ts`:

```typescript
import { GitCompareArrows } from "lucide-react"; // Icon choice

{
  to: "/compare",
  label: "Compare",
  icon: GitCompareArrows,
  activePaths: ["/compare"],
},
```

The entry should be placed after the **Resume Studio** entry and before **Tracking Inbox**.

### 4.4 React Router Route

A new route must be registered in `orchestrator/src/client/App.tsx`:

```tsx
import { ComparePage } from "./pages/ComparePage";

// Inside <Routes>:
<Route path="/compare" element={<ComparePage />} />
```

### 4.5 LinkedIn Scraping & Normalisation Service

New server-side service: `orchestrator/src/server/services/compare/`

```
compare/
  index.ts            // Re-exports
  scraper.ts          // LinkedIn page fetch via Camoufox or fallback HTTP
  normaliser.ts       // Raw HTML/JSON → NormalisedCompareProfile
  evaluator.ts        // LLM section scoring
  cache.ts            // TTL cache keyed by (tenantId, urlHash)
  apply.ts            // Quick-action merge into Design Resume
```

**Scraper strategy (ordered fallback):**
1. Attempt fetch via the existing Camoufox `camoufox-fetch.mjs` binary if available.
2. Fall back to plain HTTPS `fetch` with a realistic `User-Agent` header.
3. If both fail (bot-blocked, 999 status, CAPTCHA), surface `UPSTREAM_ERROR` to the client.

**Normaliser responsibilities:**
- Extract structured data from LinkedIn's rendered HTML or embedded JSON-LD `<script>` tags.
- Map to `NormalisedCompareProfile`; drop contact fields (`email`, `phone`, `connections`).
- Truncate all text fields: `description` ≤ 800 chars, `summary` ≤ 600 chars.
- Strip all HTML tags from text content.

---

## 5. Acceptance Criteria

- **AC-001**: Given a valid LinkedIn `/in/<slug>` URL, when the user submits it, then the scrape completes within 15 seconds and the Other Profile column populates with normalised data.
- **AC-002**: Given an invalid or non-LinkedIn URL, when the user submits it, then a validation error message is shown inline without making a server request.
- **AC-003**: Given both profiles are loaded, when the LLM evaluation completes, then every comparable section displays a coloured verdict badge (`stronger` = green, `weaker` = red, `comparable` = neutral) and a rationale tooltip/expansion.
- **AC-004**: Given a job is selected in the optional job picker, when the user triggers re-evaluation, then the section verdicts and an overall suitability score (0–100) for each profile are updated to reflect the job context.
- **AC-005**: Given the "Copy over" action is clicked for a section, when the action completes, then the matching section in the Own Profile column shows the copied content and a success toast appears.
- **AC-006**: Given the "Copy over & rewrite" action is clicked, when the action completes, then the merged section content reflects the other user's substance rewritten in the user's configured writing style.
- **AC-007**: Given a scrape of the same URL is requested within 30 minutes, then the cached result is returned without a new network fetch (verify via server logs showing no outbound request).
- **AC-008**: Given the user is unauthenticated, when any compare API endpoint is called, then the server returns `401 UNAUTHORIZED`.
- **AC-009**: Given a LinkedIn URL that returns a private/unavailable profile (404 or login wall), then the server returns `502 UPSTREAM_ERROR` and the UI shows a descriptive error state.
- **AC-010**: Given the page is loaded, when no comparison has been initiated, then the Own Profile data is displayed in the left column and the right column shows a URL input prompt.
- **AC-011**: Given the user clicks "Clear comparison", then the Other Profile column resets to the URL input state without a page reload.
- **AC-012**: Given a section exists in the Other Profile but is absent from the Own Profile, then the section is highlighted as "missing" with a distinct indicator and the copy actions are still available.

---

## 6. Test Automation Strategy

- **Test Levels**: Unit (service layer), Integration (API routes), Component (React pages/sections).
- **Frameworks**: Vitest (existing), React Testing Library (existing).
- **Test Data Management**: Use MSW (Mock Service Worker, already in test setup) to mock the LinkedIn scrape endpoint; provide fixture HTML files in `orchestrator/src/server/services/compare/__fixtures__/`.
- **CI/CD Integration**: New tests must pass all existing CI-parity checks defined in `AGENTS.md` (Biome lint, type checks, Vitest suite).
- **Coverage Requirements**: The normaliser (`normaliser.ts`) must have ≥ 90% line coverage given it handles untrusted external data.
- **Performance Testing**: The scrape-to-evaluation pipeline must complete in ≤ 20 seconds under nominal conditions; add a timeout assertion in integration tests.

### Key Test Cases

| Layer | Test |
|---|---|
| Unit | `normaliser.ts` correctly maps LinkedIn HTML fixture to `NormalisedCompareProfile` |
| Unit | `normaliser.ts` strips HTML, drops email/phone fields |
| Unit | `scraper.ts` surfaces `UPSTREAM_ERROR` when LinkedIn returns 999 |
| Unit | `cache.ts` returns cached result on second call within TTL; re-fetches after expiry |
| Integration | `POST /api/compare/scrape` returns 400 for non-LinkedIn URL |
| Integration | `POST /api/compare/apply` returns 404 when cache is empty |
| Integration | `POST /api/compare/apply` with `copy_rewrite` calls LLM service and merges output |
| Component | `ComparePage` renders Own Profile column without Other Profile on initial load |
| Component | Section verdict badge shows correct colour per verdict value |
| Component | "Copy over" button is disabled while an apply operation is in flight |

---

## 7. Rationale & Context

**Why LinkedIn only (v1.0)?** LinkedIn is the most universally used professional profile platform and has predictable HTML structure. Adding other platforms requires separate normaliser implementations and is deferred.

**Why server-side scraping?** CORS restrictions prevent client-side fetching of LinkedIn. Centralising scraping on the server also allows caching, rate-limiting, and keeping the raw HTML out of the client bundle.

**Why TTL cache?** Scraping LinkedIn is slow (1–10 seconds) and risks rate-limiting if repeated. A 30-minute cache (consistent with the existing `getProfile` cache) balances freshness with performance.

**Why Design Resume only for copy actions?** The Design Resume is the editable, locally owned resume. RxResume is an external service accessed read-only; writing back to it would require OAuth write scopes not currently in scope.

**Why stream evaluations via SSE?** Section-level LLM calls can take 2–8 seconds each. Streaming allows the UI to progressively reveal results section by section rather than blocking for the full evaluation, consistent with how the Ghostwriter feature works.

**Why rewrite in user's writing style?** Simply copying another person's wording into your own resume risks stylistic inconsistency and potential plagiarism concerns. The LLM rewrite step adapts the substance while giving the user's voice precedence.

---

## 8. Dependencies & External Integrations

### External Systems
- **EXT-001**: LinkedIn Public Profile Pages — source of scraped profile data; accessed via GET over HTTPS. No LinkedIn API account required; relies on public HTML.

### Third-Party Services
- **SVC-001**: Configured LLM Provider (OpenAI, Ollama, Gemini, etc.) — used for section evaluation and rewrite. Must honour the user's existing LLM configuration in `AppSettings`.

### Infrastructure Dependencies
- **INF-001**: Camoufox headless browser binary (`scripts/camoufox-fetch.mjs`) — optional; used as primary scrape method to bypass LinkedIn bot mitigation. The feature must degrade gracefully if Camoufox is not installed.
- **INF-002**: SQLite Design Resume store — target for copy/rewrite quick actions.

### Data Dependencies
- **DAT-001**: `GET /api/profile` — Own Profile data used as left-column content and as input to the LLM comparison prompt.
- **DAT-002**: `GET /api/jobs` — Used to populate the optional job picker dropdown (only `id`, `title`, `jobDescription` fields required).
- **DAT-003**: `AppSettings.writingStyle` — Used as LLM rewrite style context.

### Technology Platform Dependencies
- **PLT-001**: Node.js ≥ 22 (existing CI constraint).
- **PLT-002**: React Router v6 (existing).
- **PLT-003**: TailwindCSS + shadcn/ui (existing component system).

---

## 9. Examples & Edge Cases

### Example: Scrape Request

```http
POST /api/compare/scrape
Content-Type: application/json

{
  "url": "https://www.linkedin.com/in/satya-nadella"
}
```

```json
// 200 OK
{
  "ok": true,
  "data": {
    "sourceUrl": "https://www.linkedin.com/in/satya-nadella",
    "fetchedAt": "2026-05-23T10:00:00.000Z",
    "basics": {
      "name": "Satya Nadella",
      "headline": "Chairman and CEO at Microsoft",
      "location": "Redmond, Washington, United States",
      "summary": "..."
    },
    "sections": {
      "experience": [
        {
          "company": "Microsoft",
          "position": "Chairman and CEO",
          "period": "Feb 2014 – Present",
          "description": "..."
        }
      ],
      "education": [ ... ],
      "skills": [ ... ],
      "certifications": [],
      "projects": [],
      "languages": [],
      "awards": []
    }
  },
  "meta": { "requestId": "req_abc123" }
}
```

### Edge Cases

| Scenario | Expected behaviour |
|---|---|
| LinkedIn redirects to login wall (status 999) | Return `502 UPSTREAM_ERROR`; display "Profile is private or unavailable" in UI |
| LinkedIn URL with query parameters or tracking suffix (e.g. `?trk=...`) | Canonicalise to bare `/in/<slug>` before caching and scraping |
| Other user has no experience section | Render "No experience listed" placeholder; still show copy action pointing to an empty section with a "nothing to copy" disabled state |
| Own profile has no matching section (e.g. user has no education) | Render "Missing from your profile" badge; copy action adds the section |
| LLM returns verdict outside expected enum | Treat as `comparable`; log a warning |
| Copy action applied while a previous apply is in flight | Disable all action buttons until the in-flight request settles |
| User profile is sourced from RxResume (no local Design Resume) | Prompt user to create a local Design Resume first; disable all copy actions with tooltip explanation |
| URL normalisation: `linkedin.com/in/user/` trailing slash | Strip trailing slash before validation |

---

## 10. Validation Criteria

1. All acceptance criteria (AC-001 through AC-012) pass in automated tests or manual QA walkthrough.
2. `POST /api/compare/scrape` rejects non-LinkedIn URLs with `400` consistently.
3. Scraped data never includes `email`, `phone`, or `connections` count fields in any server response.
4. `POST /api/compare/apply` with `copy` or `copy_rewrite` produces a verifiable change in the Design Resume retrieved via `GET /api/design-resume`.
5. The normaliser test suite achieves ≥ 90% line coverage.
6. All CI-parity checks in `AGENTS.md` pass: Biome lint, TypeScript type checks for `orchestrator`, `shared`, and extractor workspaces, client build, and Vitest suite.
7. No new `console.log` / `console.error` calls in any server-side code path introduced by this feature.

---

## 11. Related Specifications / Further Reading

- [shared/src/types/design-resume.ts](../shared/src/types/design-resume.ts) — RxResume V5 schema
- [shared/src/types/settings.ts](../shared/src/types/settings.ts) — `ResumeProfile`, `AppSettings`
- [shared/src/types/api.ts](../shared/src/types/api.ts) — API response contract
- [orchestrator/src/server/services/profile.ts](../orchestrator/src/server/services/profile.ts) — Own Profile loading
- [orchestrator/src/server/services/scorer.ts](../orchestrator/src/server/services/scorer.ts) — Existing LLM scoring pattern
- [orchestrator/src/server/services/ghostwriter.ts](../orchestrator/src/server/services/ghostwriter.ts) — SSE streaming pattern
- [orchestrator/src/server/infra/sse.ts](../orchestrator/src/server/infra/sse.ts) — SSE helpers
- [orchestrator/src/client/components/navigation.ts](../orchestrator/src/client/components/navigation.ts) — NAV_LINKS
- [AGENTS.md](../AGENTS.md) — API contract, logging, and CI-parity rules
- [scripts/camoufox-fetch.mjs](../scripts/camoufox-fetch.mjs) — Camoufox scraper harness

> **Next step**: Once this specification is reviewed, run the **`refine-issue`** agent on each GitHub issue derived from this spec to enrich it with testable acceptance criteria before moving to planning.
