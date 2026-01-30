# PRD: Remote Jobs Filter and Badge

**Date:** 2026-01-30

---

## Problem Statement

### What problem are we solving?
Users cannot filter job searches to only show remote positions. The JobSpy scraper supports remote filtering via the `is_remote` parameter, but this capability is not exposed to users. Additionally, when the `isRemote` field is populated by JobSpy, it is stored in the database but never displayed in the UI, making it impossible for users to identify remote jobs at a glance.

**User Impact:**
- Users waste time reviewing non-remote jobs when only interested in remote positions
- Users cannot quickly identify which jobs in their list are remote-friendly
- The existing `isRemote` data collected from Indeed/LinkedIn is unused

**Business Impact:**
- Reduces user efficiency in job discovery workflow
- Underutilizes data already being collected from job sites

---

## Proposed Solution

### Overview
Add a "Remote Jobs?" boolean toggle to the JobSpy extractor settings that filters job searches to only remote positions. When enabled, the JobSpy scraper will pass `is_remote=True` to limit results to remote jobs. Additionally, display a "Remote" badge on job cards in the UI when the `isRemote` field is true, making remote positions immediately visible to users.

### User Experience

#### User Flow: Enable Remote-Only Search
1. User navigates to Settings page
2. User scrolls to "JobSpy Extractor" section
3. User checks the "Remote Jobs?" checkbox
4. System saves the setting to the database
5. On next pipeline run, JobSpy scraper only returns remote jobs

#### User Flow: View Remote Jobs
1. User views job list in the Orchestrator page
2. Jobs with `isRemote: true` display a "Remote" badge
3. User can quickly identify remote positions without opening job details

### Design Considerations

**UI Components:**
- Checkbox in JobSpy settings section with label "Remote Jobs?" and description "Only search for remote job listings"
- "Remote" badge displayed in `JobHeader.tsx` component alongside existing Source and Sponsor badges
- Badge styling should use the outline variant for consistency with the Source badge

**Accessibility:**
- Checkbox must be keyboard accessible and screen-reader friendly (inherit from existing checkboxes)
- Badge should have appropriate color contrast (use existing Badge component variants)

---

## End State

When this PRD is complete, the following will be true:

- [ ] "Remote Jobs?" checkbox exists in JobSpy settings UI
- [ ] Setting defaults to `false` (unchecked)
- [ ] Setting persists to database as `jobspyIsRemote` key
- [ ] Setting can be overridden via `JOBSPY_IS_REMOTE` environment variable
- [ ] When enabled, JobSpy scraper passes `is_remote=True` to `scrape_jobs()`
- [ ] When disabled or not set, JobSpy scraper passes `is_remote=False` (default behavior)
- [ ] "Remote" badge displays on jobs where `isRemote: true`
- [ ] Badge appears in `JobHeader.tsx` component
- [ ] Badge is visible in job detail views
- [ ] If job site doesn't support remote filtering, scraper continues silently without error
- [ ] All existing tests pass
- [ ] Type definitions are updated across the stack

---

## Success Metrics

No quantitative metrics required for v1. This is a feature enablement change.

---

## Acceptance Criteria

### Setting Storage & Retrieval
- [ ] `jobspyIsRemote` field added to TypeScript types (`orchestrator/src/shared/types.ts`)
- [ ] `jobspyIsRemote` validation schema added (`orchestrator/src/shared/settings-schema.ts`)
- [ ] `jobspyIsRemote` added to database repository setting keys (`orchestrator/src/server/repositories/settings.ts`)
- [ ] Setting stored as `"1"` (true) or `"0"` (false) in database
- [ ] Setting retrieval supports environment variable `JOBSPY_IS_REMOTE` with default `"0"`
- [ ] Database override takes precedence over environment variable

### API Layer
- [ ] Settings API route (`/api/settings`) accepts `jobspyIsRemote` boolean
- [ ] Settings API route stores value as `"1"`/`"0"` string
- [ ] Settings service reads and parses `JOBSPY_IS_REMOTE` env var with default `false`
- [ ] Settings service merges database override with environment default

### JobSpy Integration
- [ ] `RunJobSpyOptions` interface includes `isRemote?: boolean` parameter
- [ ] `runJobSpy()` function passes `JOBSPY_IS_REMOTE` env var to Python process
- [ ] Environment variable defaults to `"0"` if not provided
- [ ] Pipeline orchestrator reads `jobspyIsRemote` from settings
- [ ] Pipeline orchestrator converts database string (`"1"`/`"0"`) to boolean
- [ ] Pipeline orchestrator passes `isRemote` boolean to `runJobSpy()` call

### Python Scraper
- [ ] `scrape_jobs.py` reads `JOBSPY_IS_REMOTE` environment variable
- [ ] Value parsed using `_env_bool()` helper with default `False`
- [ ] `is_remote` parameter passed to `scrape_jobs()` function call
- [ ] If job site doesn't support remote filtering, scraper continues without error

### UI - Settings
- [ ] "Remote Jobs?" checkbox added to `JobspySection.tsx` component
- [ ] Checkbox placed after "Fetch LinkedIn Description" field
- [ ] Label text: "Remote Jobs?"
- [ ] Description text: "Only search for remote job listings"
- [ ] Checkbox uses `react-hook-form` Controller pattern
- [ ] Checkbox defaults to `false` (unchecked)
- [ ] Value persists when user clicks Save
- [ ] Checkbox state reflects saved setting on page reload

### UI - Remote Badge
- [ ] "Remote" badge component added to `JobHeader.tsx`
- [ ] Badge displays when `job.isRemote === true`
- [ ] Badge does not display when `job.isRemote === false` or `null`
- [ ] Badge uses outline variant for visual consistency
- [ ] Badge text displays "Remote"
- [ ] Badge positioned near Source badge in header
- [ ] Badge visible in job detail panel

---

## Technical Context

### Existing Patterns

**Boolean Setting Pattern** (`jobspyLinkedinFetchDescription`):
- Storage: `orchestrator/src/server/api/routes/settings.ts:166-219`
- Retrieval: `orchestrator/src/server/services/settings.ts:159-170`
- Database format: `"1"` (true) / `"0"` (false) / `null`
- Environment variable parsing: `(process.env.VAR_NAME || "0") === "1"`
- UI component: `orchestrator/src/client/pages/settings/components/JobspySection.tsx:393-426`

**Badge Display Pattern** (Sponsor badge):
- Implementation: `orchestrator/src/client/components/JobHeader.tsx:66-175`
- Conditional rendering based on setting flag
- Uses `Badge` component from `@/components/ui/badge`
- Styled with color indicators and descriptive text

**JobSpy Parameter Passing Pattern**:
- Service layer: `orchestrator/src/server/services/jobspy.ts:124-213`
- Pipeline layer: `orchestrator/src/server/pipeline/orchestrator.ts:183-206`
- Environment variable mapping with fallback defaults
- String conversion for Python process env vars

### Key Files

- `orchestrator/src/shared/types.ts` - Type definitions (Job interface already includes `isRemote: boolean | null` at line 141)
- `orchestrator/src/shared/settings-schema.ts` - Zod validation schemas
- `orchestrator/src/server/repositories/settings.ts` - Database setting keys
- `orchestrator/src/server/api/routes/settings.ts` - Settings PATCH endpoint
- `orchestrator/src/server/services/settings.ts` - Settings retrieval with env var support
- `orchestrator/src/server/services/jobspy.ts` - JobSpy service and options interface
- `orchestrator/src/server/pipeline/orchestrator.ts` - Pipeline that calls JobSpy
- `extractors/jobspy/scrape_jobs.py` - Python scraper script
- `orchestrator/src/client/pages/settings/components/JobspySection.tsx` - JobSpy UI settings
- `orchestrator/src/client/components/JobHeader.tsx` - Job header with badges
- `orchestrator/src/components/ui/badge.tsx` - Badge UI component

### System Dependencies

**Existing Dependencies (No New Installations Required):**
- `python-jobspy` library (already installed in `extractors/jobspy`)
- React Hook Form (already used in settings UI)
- Zod validation (already used for settings schema)
- shadcn/ui Badge component (already implemented)

**Database:**
- SQLite database with existing `settings` table (key-value store)
- Jobs table already has `is_remote` column (line 47 in `orchestrator/src/server/db/schema.ts`)

### Data Model Changes

**No schema migrations required.** 

The `isRemote` field already exists in:
- Database schema: `orchestrator/src/server/db/schema.ts:47` (`is_remote` column)
- TypeScript types: `orchestrator/src/shared/types.ts:141` (`isRemote: boolean | null`)
- Repository mapping: `orchestrator/src/server/repositories/jobs.ts:284`

New setting key `jobspyIsRemote` will be stored in existing `settings` table as key-value pair.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| JobSpy library doesn't support `is_remote` parameter on all job sites | Medium | Medium | Silently continue if parameter not supported; don't fail the scrape |
| Users enable remote filter but get no results | Low | Low | Document that not all job sites support remote filtering; results may vary |
| Boolean conversion mismatch between layers | Low | Medium | Follow exact pattern from `jobspyLinkedinFetchDescription` setting |
| Badge clutters UI with too many badges | Low | Low | Use minimal outline style; only show when `isRemote` is explicitly true |

---

## Alternatives Considered

### Alternative 1: Multi-Select Filter (Remote/Hybrid/On-Site)
- **Description:** Instead of boolean toggle, provide dropdown with Remote/Hybrid/On-Site options
- **Pros:** More granular control; matches how many job sites categorize positions
- **Cons:** JobSpy library only supports boolean `is_remote` parameter; would require custom post-filtering logic; adds complexity
- **Decision:** Rejected. Keep v1 simple with boolean toggle. Can add multi-select in v2 if user demand exists.

### Alternative 2: Post-Filter in Database Instead of Scraper
- **Description:** Always scrape all jobs, then filter by `isRemote` field in database queries
- **Pros:** Gives users flexibility to toggle filter without re-scraping; faster iteration
- **Cons:** Wastes API calls and scraping time on non-remote jobs; increases data storage; doesn't reduce pipeline runtime
- **Decision:** Rejected. More efficient to filter at scrape time; reduces unnecessary data collection.

### Alternative 3: Show Badge in Job List Panel Instead of Detail View
- **Description:** Display Remote badge in the compact list view (`JobListPanel.tsx`)
- **Pros:** Users see remote status immediately without clicking into job
- **Cons:** List view is intentionally compact; adding badges may clutter; `JobHeader` is already the established location for badges
- **Decision:** Rejected for v1. Place badge in `JobHeader` component (used in detail views). Can add to list view in v2 if needed.

---

## Non-Goals (v1)

Explicitly out of scope for this PRD:

- **Hybrid work filtering** - JobSpy library doesn't support hybrid as a separate category; would require custom logic and field expansion
- **Remote badge in compact list view** - Keeping list view minimal; badge only in detail view for v1
- **Retroactive population of `isRemote` for existing jobs** - Only new scrapes will use the filter; no backfill of historical data
- **Remote filtering for Gradcracker/UKVisaJobs extractors** - These extractors use different scraping logic; only JobSpy supports remote filtering
- **Analytics/tracking of remote filter usage** - No metrics instrumentation in v1; can add in v2 if needed
- **Remote location preference (e.g., "Remote - US Only")** - JobSpy's `is_remote` is boolean only; geographic restrictions deferred to v2

---

## Interface Specifications

### Environment Variable

**New Variable:**
```bash
# Default: "0" (false)
# Set to "1" to filter JobSpy searches to remote jobs only
JOBSPY_IS_REMOTE=0
```

**Precedence:**
1. Database setting (highest priority)
2. `JOBSPY_IS_REMOTE` environment variable
3. Hardcoded default: `false`

### API

**Existing endpoint modified:**
```
PATCH /api/settings
Request: {
  ...
  jobspyIsRemote: boolean | null
}
Response: {
  success: boolean
  settings: { jobspyIsRemote: boolean, ... }
}
```

### Python Script

**Parameter added to scrape_jobs() call:**
```python
jobs = scrape_jobs(
    site_name=sites,
    search_term=search_term,
    location=location,
    results_wanted=results_wanted,
    hours_old=hours_old,
    country_indeed=country_indeed,
    linkedin_fetch_description=linkedin_fetch_description,
    is_remote=is_remote,  # NEW: boolean, default False
)
```

### UI Component

**JobSpy Settings Section:**
```tsx
<Controller
  name="jobspyIsRemote"
  control={control}
  render={({ field }) => (
    <div>
      <Checkbox
        id="jobspyIsRemote"
        checked={field.value ?? false}
        onCheckedChange={(checked) => {
          field.onChange(checked === "indeterminate" ? null : checked === true);
        }}
      />
      <Label>Remote Jobs?</Label>
      <Description>Only search for remote job listings</Description>
    </div>
  )}
/>
```

**Remote Badge Component:**
```tsx
{job.isRemote === true && (
  <Badge variant="outline">Remote</Badge>
)}
```

---

## Documentation Requirements

- [ ] Update `.env.example` with `JOBSPY_IS_REMOTE` variable (commented)
- [ ] Update README.md JobSpy extractor section (optional - no user-facing docs needed for settings UI)
- [ ] No API documentation changes required (internal settings API unchanged)

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Should the Remote badge also appear in the compact job list view? | Devin | N/A | Resolved: No, detail view only (v1) |
| Should we track metrics on remote filter usage? | Devin | N/A | Resolved: No metrics in v1 |
| What happens if a job site doesn't support remote filtering? | Devin | N/A | Resolved: Silently continue |
| Should the setting persist across sessions? | Devin | N/A | Resolved: Yes, persist based on UI setting |
| Does `is_remote` parameter work with both Indeed and LinkedIn? | Devin | N/A | Resolved: Assumed yes, no known issues |

---

## Appendix

### Glossary

- **JobSpy**: Python library used to scrape job listings from Indeed, LinkedIn, and other job sites
- **Extractor**: Specialized scraper component (JobSpy, Gradcracker, UKVisaJobs)
- **Pipeline**: Automated workflow that runs extractors, scores jobs, and generates tailored resumes
- **Badge**: Small UI label/pill component that displays metadata on job cards
- **is_remote**: Boolean parameter in JobSpy's `scrape_jobs()` function that filters to remote-only jobs

### References

- JobSpy Library Documentation: https://github.com/Bunsly/JobSpy
- Existing `isRemote` field implementation: `orchestrator/src/shared/types.ts:141`
- Sponsor badge reference implementation: `orchestrator/src/client/components/JobHeader.tsx:66-175`
- Boolean setting pattern: `jobspyLinkedinFetchDescription` setting (multiple files)
