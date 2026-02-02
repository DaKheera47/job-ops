# PRD: Configurable Salary Penalty for Job Scoring

**Date:** 2026-02-02  
**Feature:** Job scoring adjustment based on salary transparency

---

## Problem Statement

### What problem are we solving?

Job postings without salary information create friction in the job search process. Currently, JobOps scores all jobs purely on suitability match (skills, experience, location, etc.) without considering salary transparency. This creates two problems:

1. **Ranking inefficiency**: Jobs without salary information can rank highly, forcing users to investigate compensation details manually before deciding to apply. This wastes time reviewing jobs that may not meet salary expectations.

2. **Lack of transparency signals**: Users who value compensation transparency have no way to prioritize employers who disclose salary information upfront. Transparent employers should be rewarded in the ranking system.

### Current behavior

- The AI scoring system (0-100 scale) evaluates jobs across 5 criteria: skills match (30pts), experience level (25pts), location/remote (15pts), industry fit (15pts), career growth (15pts)
- Salary information is passed to the LLM in the scoring prompt but has no explicit weight
- Jobs with "Salary not listed" appear in results with no differentiation from transparent postings

### User impact

Users must:
- Click into job details to discover lack of salary information
- Manually deprioritize or skip jobs without salary
- Cannot systematically filter or downrank non-transparent postings

### Why now?

JobOps recently added salary display functionality to the UI (showing structured salary data from extractors). With salary visibility in place, users can now benefit from scoring adjustments that reflect transparency preferences.

---

## Proposed Solution

### Overview

Add a user-configurable setting that allows users to reduce scores for jobs missing salary information. The penalty is applied during the scoring phase (both LLM and mock fallback) and persisted to the database. This ensures consistency across all client interfaces and enables users to systematically prioritize transparent employers.

### User Experience

#### User Flow: Enable Salary Penalty

1. User navigates to Settings page (`/settings`)
2. User opens new "Scoring" accordion section
3. User enables checkbox: "Lower scores for jobs without salary information"
4. User (optionally) adjusts penalty amount slider/input (default: 10 points, range: 0-100)
5. User clicks "Save"
6. System persists settings to database
7. Future scoring runs apply the penalty automatically

#### User Flow: Disable Salary Penalty

1. User navigates to Settings page
2. User opens "Scoring" accordion section
3. User unchecks "Lower scores for jobs without salary information"
4. User clicks "Save"
5. System persists settings (null override = disabled)
6. Future scoring runs skip penalty logic

#### User Flow: Reset to Default

1. User clicks "Reset to default" button on Settings page
2. System resets all settings including salary penalty (disabled, 10pt default)
3. User sees confirmation toast

### Design Considerations

**Accessibility:**
- Checkbox and number input follow existing settings patterns
- Labels use descriptive text ("Lower scores for jobs without salary information")
- Keyboard navigation supported (AccordionItem + form controls)
- WCAG AA compliance (matches existing settings sections)

**Visual design:**
- New "Scoring" accordion section placed between "Display Settings" and "Environment Settings"
- Calculator icon (lucide-react `Calculator`) for section header
- Number input disabled (greyed out) when checkbox unchecked
- Effective/default value display matches pattern in DisplaySettingsSection.tsx

**Platform considerations:**
- Settings persist across browser sessions (database-backed)
- Environment variable override support (`PENALIZE_MISSING_SALARY`, `MISSING_SALARY_PENALTY`)
- Works in Docker deployments (ENV vars set in docker-compose.yml)

---

## End State

When this PRD is complete, the following will be true:

- [ ] Setting `penalizeMissingSalary` (boolean) exists in settings schema and can be toggled via UI
- [ ] Setting `missingSalaryPenalty` (0-100 integer) exists and can be configured via UI
- [ ] Default values: `penalizeMissingSalary=false`, `missingSalaryPenalty=10`
- [ ] Environment variables `PENALIZE_MISSING_SALARY` and `MISSING_SALARY_PENALTY` override defaults
- [ ] Database overrides take precedence over environment variables
- [ ] Scoring logic (both LLM and mock fallback) checks settings and applies penalty when enabled
- [ ] Penalty only applies when `job.salary` field is null, undefined, empty string, or whitespace-only
- [ ] Jobs with any non-whitespace salary value (including partial info like "Competitive") are NOT penalized
- [ ] Adjusted scores are persisted to `jobs.suitability_score` field (not dynamically calculated on display)
- [ ] UI "Scoring" section renders in settings page accordion
- [ ] UI checkbox enables/disables penalty
- [ ] UI number input sets penalty amount (disabled when checkbox unchecked)
- [ ] UI displays effective vs default values
- [ ] "Reset to default" button resets both penalty settings
- [ ] Settings validation enforces 0-100 range for penalty amount
- [ ] Form validation displays errors for invalid penalty values

---

## Success Metrics

### Quantitative

No quantitative metrics defined for v1. This is a user preference feature rather than a conversion/retention optimization.

### Qualitative

- Users report satisfaction with ability to prioritize transparent employers
- No user complaints about scoring behavior or unexpected penalties
- Feature adoption can be tracked via database queries (`SELECT COUNT(*) FROM settings WHERE key = 'penalizeMissingSalary' AND value = 'true'`)

---

## Acceptance Criteria

### Feature: Settings Schema & Types

- [ ] `AppSettings` interface includes 6 new fields:
  - `penalizeMissingSalary` (effective boolean)
  - `defaultPenalizeMissingSalary` (boolean)
  - `overridePenalizeMissingSalary` (boolean | null)
  - `missingSalaryPenalty` (effective number)
  - `defaultMissingSalaryPenalty` (number)
  - `overrideMissingSalaryPenalty` (number | null)
- [ ] `updateSettingsSchema` (Zod) validates:
  - `penalizeMissingSalary: z.boolean().nullable().optional()`
  - `missingSalaryPenalty: z.number().int().min(0).max(100).nullable().optional()`
- [ ] TypeScript compilation succeeds with new types

### Feature: Backend Settings Service

- [ ] `getEffectiveSettings()` returns default values when no overrides exist:
  - `defaultPenalizeMissingSalary: false`
  - `defaultMissingSalaryPenalty: 10`
  - `penalizeMissingSalary: false` (effective)
  - `missingSalaryPenalty: 10` (effective)
- [ ] Environment variables override defaults:
  - `PENALIZE_MISSING_SALARY=true` → `penalizeMissingSalary: true`
  - `MISSING_SALARY_PENALTY=25` → `missingSalaryPenalty: 25`
- [ ] Database overrides take precedence over environment variables
- [ ] `applyStoredEnvOverrides()` applies boolean setting to `process.env.PENALIZE_MISSING_SALARY`
- [ ] Settings API endpoints return new fields in response

### Feature: Scoring Logic

- [ ] `scoreJobSuitability()` function:
  - Fetches `penalizeMissingSalary` and `missingSalaryPenalty` from settings
  - After LLM returns score, checks if penalty enabled
  - If enabled AND `!job.salary?.trim()`, subtracts penalty from score
  - Clamps final score to 0-100 range: `Math.max(0, aiScore - penalty)`
  - Returns adjusted score
- [ ] `mockScore()` function (keyword fallback):
  - Made async to support settings access
  - Applies same penalty logic as LLM path
  - Call site in `scoreJobSuitability()` updated to `await mockScore(job)`
- [ ] Penalty NOT applied when:
  - `penalizeMissingSalary === false`
  - `job.salary` contains any non-whitespace characters (including partial info)
- [ ] Score adjustment is invisible to client (stored in database, not calculated on-demand)

### Feature: Frontend Settings UI

- [ ] New file created: `ScoringSettingsSection.tsx` component
- [ ] Component renders:
  - AccordionItem with value="scoring"
  - Calculator icon in trigger
  - Checkbox bound to `penalizeMissingSalary` field
  - Number input bound to `missingSalaryPenalty` field (disabled when checkbox unchecked)
  - Effective vs default value display
- [ ] `SettingsPage.tsx` integration:
  - Imports `ScoringSettingsSection`
  - Adds `scoring` to `getDerivedSettings()` helper
  - Adds fields to `DEFAULT_FORM_VALUES`, `NULL_SETTINGS_PAYLOAD`, `mapSettingsToForm()`
  - Renders section in accordion (between Display and Environment)
  - Includes fields in `onSave()` payload with `nullIfSame()` normalization
- [ ] Form validation displays errors for invalid penalty values (< 0 or > 100)
- [ ] Number input placeholder shows default value (10)
- [ ] Settings persist across page refreshes

### Feature: Settings Persistence

- [ ] PATCH `/api/settings` accepts new fields
- [ ] GET `/api/settings` returns new fields in response
- [ ] Settings repository (`settings.ts`) stores/retrieves via key-value table:
  - Key `penalizeMissingSalary` → value `"true"` or `"false"` or null
  - Key `missingSalaryPenalty` → value `"0"`-`"100"` or null
- [ ] "Reset to default" button clears overrides (sets to null)

---

## Technical Context

### Existing Patterns

**Settings architecture (3-tier override system):**
- Pattern: `orchestrator/src/server/services/settings.ts:14-226`
- Every setting has 3 values: default (env or hardcoded), override (database), effective (override ?? default)
- TypeScript type mirrors this with `{setting}`, `default{Setting}`, `override{Setting}` fields

**Boolean settings with env var support:**
- Pattern: `orchestrator/src/server/services/envSettings.ts:14-18` (readableBooleanConfig)
- Settings stored as strings `"true"`/`"false"` in database
- Parsed via `parseEnvBoolean()` helper
- Applied to `process.env` via `applyEnvValue()`

**Settings UI sections:**
- Pattern: `orchestrator/src/client/pages/settings/components/DisplaySettingsSection.tsx`
- AccordionItem with consistent styling
- Controller/useFormContext for form binding
- Checkbox with `field.onChange` for boolean settings
- Effective vs default value display at bottom
- Separator between description and metadata

**Score calculation:**
- Pattern: `orchestrator/src/server/services/scorer.ts:38-88`
- Async function fetches settings via `getSetting(key)`
- Returns `SuitabilityResult { score: number, reason: string }`
- Clamps score to 0-100 range before returning

### Key Files

- `orchestrator/src/shared/types.ts:474-558` - AppSettings interface definition
- `orchestrator/src/shared/settings-schema.ts` - Zod validation schema for settings updates
- `orchestrator/src/server/services/settings.ts` - Settings service with override resolution logic
- `orchestrator/src/server/services/envSettings.ts` - Environment variable configuration and migration
- `orchestrator/src/server/services/scorer.ts` - Job scoring logic (LLM and mock fallback)
- `orchestrator/src/server/repositories/settings.ts` - Database access layer for settings (generic key-value)
- `orchestrator/src/client/pages/SettingsPage.tsx` - Main settings page with form management
- `orchestrator/src/client/pages/settings/components/DisplaySettingsSection.tsx` - Reference implementation for UI section

### System Dependencies

**Runtime:**
- Node.js 20+ (existing requirement)
- better-sqlite3 (existing, no changes needed)
- Zod (existing, for validation)
- React Hook Form (existing, for form state)

**Build:**
- TypeScript (types updated)
- Vite (no changes)

**External services:**
- None (feature is self-contained)

### Data Model Changes

**No database migration required.** The `settings` table already exists as a generic key-value store:

```sql
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)
```

New rows will be inserted automatically when users save settings:
- Row 1: `key='penalizeMissingSalary'`, `value='true'|'false'`
- Row 2: `key='missingSalaryPenalty'`, `value='0'-'100'`

**No job schema changes.** Adjusted scores are written to existing `jobs.suitability_score` column (REAL type).

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users set penalty too high (e.g., 100 pts), eliminating all jobs without salary from consideration | Medium | Low | UI guidance text could mention typical values (5-15). Max validation at 100 prevents overflow but allows experimentation. |
| Performance degradation from additional database queries in scoring loop | Low | Low | Two additional `getSetting()` calls per job scored. Settings are cached in-memory by better-sqlite3. Scoring is already I/O bound (LLM API calls ~1-3s), so +1ms is negligible. |
| Inconsistent penalty application if settings change mid-pipeline | Low | Low | Settings are read per-job during scoring. Pipeline runs are typically < 10 minutes. User would need to change settings during active run for inconsistency. Acceptable for v1. |
| Jobs with partial salary info (e.g., "$50k+") should be treated differently than fully missing | Low | Low | v1 uses simple check: any non-whitespace text = no penalty. Can refine in v2 if users report issues. |
| Users expect penalty to apply retroactively to already-scored jobs | Medium | Low | Settings page could include note: "Only affects newly scored jobs." Or add "Re-score all jobs" button in future version. |
| Breaking change if settings schema evolves | Low | Medium | Use nullable/optional fields in Zod schema. Graceful defaults if missing. Follow existing migration patterns (see OpenRouter → LLM API key migration in envSettings.ts). |

---

## Alternatives Considered

### Alternative 1: Client-side score adjustment (dynamic penalty on display)

- **Description:** Store original AI scores in database. Apply penalty in frontend when displaying/sorting jobs.
- **Pros:** 
  - No need to re-score jobs when penalty settings change
  - Original scores preserved for auditing
  - Simpler backend logic
- **Cons:** 
  - API clients must implement penalty logic (inconsistency risk)
  - Sorting/filtering on server becomes complex (requires passing settings to queries)
  - No single source of truth for "effective score"
  - Pipeline filtering (`minSuitabilityScore`) would use unadjusted scores
- **Decision:** Rejected. Apply penalty during scoring for consistency with pipeline logic and API simplicity. Users can re-run pipeline if penalty settings change.

### Alternative 2: Structured salary requirement (only penalize if salaryMinAmount/salaryMaxAmount are null)

- **Description:** Check for structured salary data fields (salaryMinAmount, salaryMaxAmount) instead of text field.
- **Pros:**
  - More accurate detection of "real" salary data vs vague text like "Competitive salary"
  - Aligns with JobSpy extractor which provides structured data
- **Cons:**
  - Gradcracker and UKVisaJobs extractors may not populate structured fields consistently
  - Partial data (e.g., min but no max) creates edge cases
  - Users may want to penalize vague text like "Competitive salary"
- **Decision:** Rejected for v1. Keep simple check (`!job.salary?.trim()`). Can refine in v2 with structured field checks + text pattern matching if users request it.

### Alternative 3: Boost jobs WITH salary instead of penalizing missing salary

- **Description:** Add points to jobs with salary instead of subtracting from jobs without.
- **Pros:**
  - Positive framing ("reward transparency")
  - No risk of pushing scores below 0
- **Cons:**
  - Can push scores above 100 (requires clamping or rescaling)
  - Naming is confusing (e.g., "Salary bonus" setting?)
  - Penalty framing matches user mental model ("deprioritize" non-transparent jobs)
- **Decision:** Rejected. Penalty approach is clearer and matches user expectation to "lower scores."

---

## Non-Goals (v1)

Explicitly out of scope for this PRD:

- **Retroactive re-scoring:** Settings only apply to future scoring runs. Already-scored jobs keep their original scores. (Why deferred: Requires bulk re-scoring logic + UI affordance. Can add "Re-score all" button in v2 if users request.)
  
- **Structured salary validation:** v1 treats any non-whitespace text as "has salary." Does not validate quality (e.g., "$50k+" vs "$50k-$70k"). (Why deferred: Requires pattern matching or AI-based salary parsing. Can add in v2 if users report false positives.)
  
- **Penalty for vague salary text:** Jobs with text like "Competitive salary" or "DOE" are not penalized. (Why deferred: Requires NLP or keyword matching. User can manually skip these jobs in v1.)
  
- **Per-source penalty settings:** Cannot configure different penalties for different job sources (e.g., 10pts for Indeed, 20pts for Gradcracker). (Why deferred: Adds UI complexity. No user demand signal yet.)
  
- **Salary range requirements:** Cannot configure "penalize if salary < $X" or "require salary range width > $Y." (Why separate: Different feature. This PRD focuses on presence/absence of salary, not salary adequacy.)

---

## Interface Specifications

### API

**Existing endpoints extended (no new routes):**

```typescript
GET /api/settings
Response: {
  penalizeMissingSalary: boolean,
  defaultPenalizeMissingSalary: boolean,
  overridePenalizeMissingSalary: boolean | null,
  missingSalaryPenalty: number,
  defaultMissingSalaryPenalty: number,
  overrideMissingSalaryPenalty: number | null,
  // ... other settings
}
```

```typescript
PATCH /api/settings
Request: {
  penalizeMissingSalary?: boolean | null,  // null = clear override
  missingSalaryPenalty?: number | null,    // 0-100 or null
  // ... other settings
}
Response: AppSettings (updated)
Errors:
  400 - Validation error (penalty out of range)
  401 - Unauthorized (if Basic Auth enabled)
  500 - Database error
```

### UI

**Component:** ScoringSettingsSection

**States:**
- Loading: Checkbox + input disabled, no values shown
- Enabled: Checkbox checked, input enabled
- Disabled: Checkbox unchecked, input greyed out
- Invalid: Red border on input + error message if value < 0 or > 100

**Interactions:**
- Click checkbox → toggle penalty enabled/disabled
- Type in input → update penalty amount (debounced)
- Form dirty → "Save" button enabled
- Click "Save" → POST to API, toast success/error
- Click "Reset to default" → clear overrides, toast confirmation

### Environment Variables

```bash
# Enable salary penalty by default (default: false)
PENALIZE_MISSING_SALARY=true

# Set default penalty amount in points (default: 10, range: 0-100)
MISSING_SALARY_PENALTY=15
```

**Precedence:** Database override > ENV var > Hardcoded default

**Example docker-compose.yml:**
```yaml
services:
  orchestrator:
    environment:
      - PENALIZE_MISSING_SALARY=true
      - MISSING_SALARY_PENALTY=15
```

---

## Documentation Requirements

- [ ] User-facing documentation updates: Add section to Settings page docs explaining salary penalty feature, typical values, and environment variable config
- [ ] API documentation updates: None (settings API already documented, new fields follow existing patterns)
- [ ] Internal runbook/playbook updates: None (feature is self-contained)
- [ ] Architecture decision records (ADRs): None (follows existing settings architecture patterns)

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Should penalty apply to mock scoring fallback? | Devin | Answered | Resolved: Yes |
| Should we log when penalty is applied? | Devin | Answered | Resolved: No |
| How does penalty interact with pipeline filtering? | Devin | Answered | Resolved: Penalty applies before minSuitabilityScore filter, maintaining parity with other score calculations |

---

## Appendix

### Glossary

- **Suitability Score:** 0-100 integer representing how well a job matches the user's profile. Calculated by AI using skills, experience, location, industry, and growth criteria.
- **Mock Scoring:** Keyword-based fallback scoring when LLM API is unavailable or returns invalid data. Uses simple keyword matching (good keywords +5pts, bad keywords -10pts).
- **Settings Override:** Database-stored value that takes precedence over environment variable or hardcoded default.
- **Effective Value:** The final resolved setting value after applying override → env var → default precedence chain.

### References

- Related feature: Salary display functionality (merged 2026-01-28) - `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx:93`
- Scoring system documentation: `documentation/orchestrator.md`
- Settings architecture: `orchestrator/src/server/services/settings.ts`
- Job extractors: `documentation/extractors/README.md`
