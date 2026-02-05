# PRD: Salary Display and Penalty Scoring

**Date:** 2026-02-05  
**Status:** Ready for Implementation

---

## Problem Statement

### What problem are we solving?

Job salary information is already collected and stored in the system but is not visible to users in the primary job browsing interface (job list panel). Users must open individual job details to see salary information, creating unnecessary friction in the job evaluation workflow.

Additionally, the current scoring system treats jobs with and without salary information equally. This creates a suboptimal user experience because:

1. **Transparency issue:** Jobs without salary transparency may indicate employer practices that don't align with user preferences
2. **Decision-making friction:** Users who prioritize salary transparency must manually filter through jobs
3. **Scoring gap:** The AI suitability scoring doesn't account for user preferences regarding salary disclosure

**User impact:**
- Users waste time clicking through jobs to check if salary is listed
- Users cannot quickly scan job lists for salary information
- Users who value salary transparency have no way to deprioritize non-transparent jobs

**Business impact:**
- Reduced user efficiency in job evaluation workflow
- Existing data (salary field) underutilized in the UI
- Scoring system doesn't capture an important user preference dimension

---

## Proposed Solution

### Overview

Add salary information display to the job list panel and create a configurable "Salary Penalty" setting that allows users to reduce the suitability score for jobs without listed salary information. This makes salary transparency visible at-a-glance and allows users to customize scoring to match their preferences.

### User Experience

Users will see salary information directly in the job list without needing to open job details. For users who value salary transparency, they can enable a penalty setting that automatically reduces scores for non-transparent jobs.

#### User Flow: Viewing Job Salary in List

1. User views job search results in the main dashboard
2. Each job item displays title, company, location, and **salary** (if available)
3. Jobs without salary simply omit the salary line (no "not listed" text)
4. User can quickly scan list to see which jobs have salary information

#### User Flow: Enabling Salary Penalty

1. User navigates to Settings page
2. User opens "Scoring Settings" accordion section
3. User enables "Penalize Missing Salary" checkbox
4. User optionally adjusts penalty amount (0-100 points, default: 10)
5. User saves settings
6. Future job scoring runs automatically apply the penalty to jobs without salary
7. User sees reduced suitability scores for non-transparent jobs in job list

#### User Flow: Understanding Penalty Impact

1. User enables salary penalty and runs pipeline
2. User views scored jobs in job list
3. User clicks on a job without salary that received a penalty
4. User sees suitability reason text that includes: "Score reduced by {X} points due to missing salary information"
5. User understands why the score is lower

### Design Considerations

**Visual Hierarchy:**
- Salary appears as third line in job list items, below company/location
- Uses same text-xs, muted-foreground styling as location for visual consistency
- Truncates long salary strings to maintain compact list layout

**Accessibility:**
- Salary information visible without interaction (no hover/click required)
- Penalty settings accessible via keyboard navigation
- Form validation provides clear error messages for invalid penalty values

**Error States:**
- Empty string and whitespace-only salaries treated as missing (hidden from UI)
- Invalid penalty values (negative, >100, non-integer) rejected with validation message
- Scoring failures still apply penalty in mock scoring fallback

---

## End State

When this PRD is complete, the following will be true:

- [ ] Job list panel displays salary information for jobs that have it
- [ ] Jobs without salary (null, empty, whitespace) hide salary line entirely
- [ ] Settings page has a new "Scoring Settings" section
- [ ] Users can enable/disable "Penalize Missing Salary" setting (default: disabled)
- [ ] Users can configure penalty amount from 0-100 points (default: 10)
- [ ] Settings persist to database and survive app restarts
- [ ] Settings support environment variable overrides (PENALIZE_MISSING_SALARY, MISSING_SALARY_PENALTY)
- [ ] Scoring service applies penalty when enabled during job scoring
- [ ] Penalty applies to both AI-based scoring and mock scoring fallback
- [ ] Suitability reason text explains when penalty was applied
- [ ] Scores are clamped to 0 minimum (no negative scores)
- [ ] Existing scored jobs are NOT re-scored (penalty only applies to new scoring runs)
- [ ] Job detail panel (JobHeader) continues to show salary as it currently does

---

## Success Metrics

### Qualitative

- User feedback indicates salary visibility improves job evaluation workflow
- Users report satisfaction with ability to customize scoring for salary transparency preferences
- No user confusion about why scores are lower when penalty is enabled (reason text is clear)

---

## Acceptance Criteria

### Feature: Salary Display in Job List

- [ ] Job list items show salary on third line (below company/location)
- [ ] Salary line only appears when salary field has non-empty, non-whitespace value
- [ ] Jobs with `salary: null` do not show salary line
- [ ] Jobs with `salary: ""` do not show salary line
- [ ] Jobs with `salary: "   "` (whitespace-only) do not show salary line
- [ ] Jobs with valid salary (e.g., "£40,000 - £50,000") show salary line
- [ ] Long salary strings are truncated with ellipsis
- [ ] Salary uses text-xs and muted-foreground styling
- [ ] Salary display works for jobs from all sources (Gradcracker, Indeed, LinkedIn, etc.)

### Feature: Salary Penalty Settings - Backend

- [ ] `penalizeMissingSalary` boolean setting exists with default value `false`
- [ ] `missingSalaryPenalty` numeric setting exists with default value `10`
- [ ] Settings support environment variable overrides
- [ ] Settings stored in database as key-value pairs
- [ ] Settings retrieved via GET /api/settings
- [ ] Settings updated via PATCH /api/settings
- [ ] Penalty amount validated to be integer between 0-100 (inclusive)
- [ ] Settings follow three-tier pattern (effective, default, override)

### Feature: Salary Penalty Settings - Frontend

- [ ] Settings page has new "Scoring Settings" accordion section
- [ ] Section contains checkbox for "Penalize Missing Salary"
- [ ] Checkbox defaults to unchecked (matches backend default: false)
- [ ] When checkbox is checked, numeric input appears for penalty amount
- [ ] Penalty amount input has min=0, max=100, step=1
- [ ] Penalty amount defaults to 10
- [ ] Form validation prevents saving invalid penalty values (negative, >100, decimals)
- [ ] Current/default values displayed below inputs
- [ ] Settings save successfully and persist across page reloads
- [ ] Settings reset to default works correctly

### Feature: Penalty Application in Scoring

- [ ] When penalty is enabled and job has no salary, score is reduced
- [ ] Score reduction matches configured penalty amount
- [ ] Final score is clamped to minimum 0 (no negative scores)
- [ ] Penalty applies in AI-based scoring path
- [ ] Penalty applies in mock scoring fallback path
- [ ] Suitability reason text includes: "Score reduced by {X} points due to missing salary information"
- [ ] Penalty logs to console with INFO level: "Applied salary penalty"
- [ ] Log includes: jobId, originalScore, penalty, finalScore
- [ ] When penalty is disabled, scores are not affected
- [ ] Existing scored jobs keep their original scores (no automatic re-scoring)

### Edge Cases

- [ ] Job with salary "Competitive" (string, not null) is NOT penalized
- [ ] Penalty amount of 0 results in no score change
- [ ] Penalty amount of 100 on job with score 50 results in score 0 (not -50)
- [ ] Penalty amount of 10 on job with score 5 results in score 0 (not -5)
- [ ] Settings update with invalid penalty (e.g., 150) returns validation error
- [ ] Mock scoring applies penalty correctly when API key is missing

---

## Technical Context

### Existing Patterns

**Settings System:**
- `orchestrator/src/server/services/settings-conversion.ts` - Defines metadata for all settings (defaultValue, parseOverride, serialize, resolve)
- `orchestrator/src/client/pages/settings/components/DisplaySettingsSection.tsx` - Pattern for boolean settings using Checkbox
- `orchestrator/src/client/pages/settings/components/BackupSettingsSection.tsx` - Pattern for numeric settings
- Settings follow three-tier value system: effective (used by app), default (from env), override (from DB)

**Scoring System:**
- `orchestrator/src/server/services/scorer.ts` - Main scoring service with `scoreJobSuitability()` function
- Scoring uses LLM (OpenRouter) for AI-based scoring with fallback to `mockScore()` for keyword-based scoring
- Scores are 0-100 integers with accompanying reason text
- Score results include: `{ score: number, reason: string }`

**Job Display:**
- `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx` - Job list UI with title, company, location
- `orchestrator/src/client/components/JobHeader.tsx` - Job detail header already displays salary with DollarSign icon (line 247-252)
- Job items use three-line layout with consistent text-xs, muted-foreground styling

### Key Files

- `shared/src/types.ts` - Job interface (line 145: `salary: string | null`), AppSettings interface (line 490-574)
- `orchestrator/src/server/repositories/settings.ts` - Database CRUD for settings (getSetting, setSetting)
- `shared/src/settings-schema.ts` - Zod validation schema for settings updates
- `orchestrator/src/server/db/schema.ts` - Settings table definition (line 153-158)
- `orchestrator/src/client/hooks/useSettings.ts` - React hook for fetching settings with caching

### System Dependencies

**Database:**
- SQLite with settings table (key-value store)
- Settings stored as TEXT, parsed/serialized by conversion layer

**Backend:**
- Node.js + Express
- Drizzle ORM for database access
- Settings service with environment variable fallback

**Frontend:**
- React + TypeScript
- React Hook Form with Zod validation
- Accordion UI component from shadcn/ui
- Checkbox component from shadcn/ui

**External Services:**
- LLM provider (OpenRouter) for AI scoring
- Continues to work if LLM unavailable (mock scoring fallback)

### Data Model Changes

**Settings Table (Existing):**
```
settings:
  key: TEXT PRIMARY KEY
  value: TEXT
  createdAt: INTEGER
  updatedAt: INTEGER
```

**New Setting Keys:**
- `penalizeMissingSalary` - stored as "0" or "1" (bit boolean)
- `missingSalaryPenalty` - stored as string integer "0" to "100"

**No schema migration required** - settings table already supports arbitrary keys.

**Job Table:**
- No changes required
- Existing `salary` field (line 145 in types.ts) is used

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users confused why scores are lower | Medium | Medium | Include clear explanation in suitability reason text. Settings UI explains what penalty does. |
| Penalty applied inconsistently across scoring paths | Low | High | Apply penalty in both AI scoring and mock scoring paths. Add integration tests. |
| Users set penalty too high, all jobs score 0 | Low | Medium | Validate penalty range (0-100). Default to moderate value (10). Show effective values in UI. |
| Performance impact from additional DB reads | Low | Low | Settings already cached in frontend. Backend reads from DB are fast (indexed key). |
| Breaking change for existing API consumers | Low | Low | Settings API is additive-only (new fields). Existing fields unchanged. Backward compatible. |

---

## Alternatives Considered

### Alternative 1: Salary Range Filtering (UI Filter)

- **Description:** Add UI filter to hide jobs without salary instead of scoring penalty
- **Pros:** Simpler implementation (no scoring changes), more explicit control
- **Cons:** Binary (hide/show) doesn't allow nuanced ranking. Doesn't integrate with AI scoring. Users lose visibility of jobs entirely.
- **Decision:** Rejected. Penalty allows jobs to still appear but ranked lower, giving users more context. Future enhancement could add filtering in addition to penalty.

### Alternative 2: LLM Prompt Context (Mention Salary Preference)

- **Description:** Pass salary preference to LLM in scoring prompt instead of post-processing penalty
- **Pros:** LLM could consider salary in context of overall job fit
- **Cons:** Non-deterministic (LLM may ignore), doesn't work in mock scoring fallback, harder to test, slower
- **Decision:** Rejected. Post-processing penalty is deterministic, fast, testable, and works in all scoring paths.

### Alternative 3: Automatic Salary Penalty (Always On)

- **Description:** Always penalize missing salary without user configuration
- **Pros:** Simpler (no settings), encourages salary transparency
- **Cons:** Forces preference on all users. Some users may not care about salary disclosure. Reduces user agency.
- **Decision:** Rejected. Make it optional (default off) to respect user preference diversity.

---

## Non-Goals (v1)

Explicitly out of scope for this PRD:

- **Salary normalization/parsing** - Salary is displayed as-is from source. No parsing of ranges, currencies, or formatting. Future enhancement if needed.
- **Salary-based filtering** - No UI to filter/hide jobs based on salary presence. Only scoring penalty. Could add in future.
- **Salary-based sorting** - No ability to sort job list by salary amount. Only affects suitability score ranking. Future enhancement.
- **Re-scoring existing jobs** - Penalty only applies to new scoring runs. No automatic batch re-scoring of historical jobs.
- **Salary data quality improvements** - No changes to extractors/crawlers to improve salary data collection. Use existing data.
- **Salary comparison/analytics** - No features to compare salaries across jobs, track salary trends, or provide salary insights. Future enhancement.
- **Different penalties per job source** - Single global penalty applies to all jobs. No per-source customization (e.g., different penalty for Indeed vs LinkedIn).

---

## Interface Specifications

### API

**Existing Endpoints (Modified Behavior):**

```
GET /api/settings
Response: {
  success: true,
  data: {
    // ... existing settings ...
    penalizeMissingSalary: boolean,
    defaultPenalizeMissingSalary: boolean,
    overridePenalizeMissingSalary: boolean | null,
    missingSalaryPenalty: number,
    defaultMissingSalaryPenalty: number,
    overrideMissingSalaryPenalty: number | null,
  }
}
```

```
PATCH /api/settings
Request: {
  penalizeMissingSalary?: boolean,
  missingSalaryPenalty?: number, // 0-100 integer
}
Response: {
  success: true,
  data: AppSettings // full settings object
}
Errors: 
  400 - Validation error (e.g., penalty > 100)
  500 - Server error
```

### UI Components

**JobListPanel (Modified):**
```tsx
<div className="job-item">
  <div className="title">{job.title}</div>
  <div className="company">{job.employer} in {job.location}</div>
  {job.salary?.trim() && (
    <div className="salary">{job.salary}</div>
  )}
</div>
```

**ScoringSettingsSection (New):**
```tsx
<AccordionItem value="scoring">
  <AccordionTrigger>Scoring Settings</AccordionTrigger>
  <AccordionContent>
    <Checkbox 
      label="Penalize Missing Salary"
      description="Reduce suitability score for jobs without salary"
    />
    {enabled && (
      <Input 
        type="number"
        label="Missing Salary Penalty"
        min={0}
        max={100}
      />
    )}
  </AccordionContent>
</AccordionItem>
```

### Environment Variables

**New Environment Variables:**
```bash
PENALIZE_MISSING_SALARY=false  # "true" or "1" to enable by default
MISSING_SALARY_PENALTY=10      # Integer 0-100
```

---

## Documentation Requirements

- [ ] Update README.md with new settings (optional environment variables section)
- [ ] Update settings documentation (if separate settings doc exists)
- [ ] Add JSDoc comments to new settings metadata in settings-conversion.ts
- [ ] No user-facing documentation required (feature is self-explanatory in UI)

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Should penalty default be different than 10? | Product Owner | N/A | Resolved: Use 10 |
| Should we re-score existing jobs? | Product Owner | N/A | Resolved: No, only new runs |
| Need specific success metrics? | Product Owner | N/A | Resolved: User feedback only |

---

## Appendix

### Glossary

- **Suitability Score:** AI-generated 0-100 score indicating job-profile fit
- **Salary Penalty:** Point reduction applied to suitability score for jobs without salary
- **Three-Tier Settings:** Pattern where settings have effective (used), default (env), and override (DB) values
- **Mock Scoring:** Fallback keyword-based scoring when LLM unavailable

### References

- Original implementation plan (internal planning document)
- PR #82 (previous implementation, settings system has since been refactored)
- Settings system architecture: `orchestrator/src/server/services/settings-conversion.ts`
- Job schema: `shared/src/types.ts` line 128-198
