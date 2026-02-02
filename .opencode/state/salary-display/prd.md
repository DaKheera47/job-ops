# PRD: Display Salary Information in Job Review Interface

**Date:** 2026-02-02

---

## Problem Statement

### What problem are we solving?

When reviewing jobs after scraping, users cannot see salary information in the job list panel, making it harder to quickly assess and prioritize opportunities. Salary data is already being scraped and stored in the database, but is only visible in specific preview contexts (via JobHeader component), not in the primary job list view where users spend most of their time scanning through opportunities.

**User Impact:**
- Users must click into each job to see salary information
- Cannot quickly scan for jobs within their desired salary range
- Slower job review workflow due to missing at-a-glance information

**Business Impact:**
- Reduced efficiency in the job application pipeline
- Users may skip viable opportunities that don't show salary upfront
- Incomplete presentation of already-captured data

### Why now?

Salary information is critical for job seekers to prioritize applications. The infrastructure already exists (data is scraped and stored), so this is a low-effort, high-impact quality-of-life improvement.

### Who is affected?

- **Primary users:** Job seekers reviewing scraped jobs in the orchestrator interface
- **Context:** Users primarily interact with the JobListPanel (left sidebar) to scan through jobs before selecting one for detailed review

---

## Proposed Solution

### Overview

Display salary information directly in the job list panel items when available, positioned below the employer and location line. When salary data is not available, show "Salary not listed" to indicate the field was checked but no data exists. This allows users to see salary information at a glance while scanning through jobs without clicking into each one.

### User Experience

#### User Flow: Reviewing Jobs in List View

1. User opens the orchestrator page with scraped jobs
2. User scans the job list panel (left sidebar)
3. For each job item, user sees:
   - Line 1: Job title (bold, primary)
   - Line 2: Employer name + location (if available)
   - Line 3: Salary information (if available) or "Salary not listed"
   - Right side: Suitability score (if available)
4. User can quickly identify jobs in their salary range without clicking
5. User clicks on a job of interest to see full details in the preview pane

#### User Flow: Reviewing Jobs in Preview Panels

1. User selects a job from the list
2. Job preview pane loads (DecideMode, ReadyPanel, or standard detail view)
3. JobHeader component displays at the top, showing salary with DollarSign icon
4. User sees consistent salary information across all views

### Design Considerations

**Visual Hierarchy:**
- Salary text uses same styling as employer/location line (small, muted)
- Plain text only, no icon (icons reserved for JobHeader component)
- `0.5rem` margin-top for visual breathing room
- Text naturally truncates if too long via parent container constraints

**Accessibility:**
- No special requirements beyond existing text rendering
- Screen readers will announce salary as part of job item content
- Visual contrast maintained via existing muted-foreground color classes

**Platform-specific considerations:**
- Responsive design already handled by existing flex layout
- No additional mobile considerations needed

---

## End State

When this PRD is complete, the following will be true:

- [ ] Salary information displays in each job list item when data exists
- [ ] "Salary not listed" displays when salary data is null/missing
- [ ] Salary continues to display in all preview panes (via existing JobHeader)
- [ ] Layout remains consistent and doesn't break with long salary strings
- [ ] Text styling matches existing employer/location line
- [ ] No visual regressions in job list or preview panels

---

## Success Metrics

### Qualitative

- Users report improved efficiency when reviewing jobs
- Users can quickly identify jobs in their salary range
- No user reports of layout issues or visual regressions

**Note:** This is a quality-of-life improvement. Specific quantitative metrics are not required for v1.

---

## Acceptance Criteria

### Feature: Job List Panel Salary Display

- [ ] Salary displays on a new line below employer/location in each job list item
- [ ] Salary uses `text-xs text-muted-foreground` styling (matching employer line)
- [ ] Salary has `mt-0.5` margin-top for spacing
- [ ] Salary text naturally truncates if exceeding container width
- [ ] When `job.salary` is null/empty, displays "Salary not listed" instead
- [ ] No salary line appears when both `job.salary` and fallback text would be empty (edge case)

### Feature: Preview Pane Consistency

- [ ] DecideMode continues to show salary in JobHeader (already implemented)
- [ ] ReadyPanel continues to show salary in JobHeader (already implemented)
- [ ] Standard detail view continues to show salary in JobHeader (already implemented)
- [ ] Salary formatting remains consistent across all views

### Technical Quality

- [ ] No TypeScript errors introduced
- [ ] No layout regressions in job list panel
- [ ] Component renders correctly with missing salary data
- [ ] Component renders correctly with very long salary strings

---

## Technical Context

### Existing Patterns

**Pattern 1: Conditional metadata rendering**
- File: `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx:86-91`
- Shows conditional rendering of location with inline text: `{job.location && <span>in {job.location}</span>}`
- Salary display should follow similar pattern for consistency

**Pattern 2: Salary display in JobHeader**
- File: `orchestrator/src/client/components/JobHeader.tsx:247-252`
- Shows how salary is currently displayed in preview panes
- Uses DollarSign icon and same conditional rendering pattern: `{job.salary && <span>...</span>}`
- Job list will use similar conditional but without icon

**Pattern 3: Tailwind styling conventions**
- File: `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx:84-91`
- Uses utility classes: `text-xs text-muted-foreground truncate`
- Margin spacing: `mt-0.5` for subtle separation
- Salary text should match this styling

### Key Files

**Primary modification:**
- `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx`
  - Lines 84-92: Job list item rendering (where salary will be added)
  - Lines 46-113: Full job item mapping logic

**Reference files (no changes needed):**
- `orchestrator/src/shared/types.ts`
  - Line 145: `salary: string | null` - formatted salary string
  - Lines 168-172: Additional salary fields (source, interval, amounts, currency)
- `orchestrator/src/client/components/JobHeader.tsx`
  - Lines 247-252: Existing salary display pattern to reference
- `orchestrator/src/client/components/discovered-panel/DecideMode.tsx`
  - Line 55: Uses JobHeader, so salary already displays there
- `orchestrator/src/client/components/ReadyPanel.tsx`
  - Lines 261-268: Uses JobHeader, so salary already displays there

### System Dependencies

**No new dependencies required:**
- Existing Job type includes salary field
- Existing Tailwind classes cover styling needs
- No API changes needed (data already fetched)

### Data Model Changes

**No database changes required:**
- Salary fields already exist in schema: `orchestrator/src/server/db/schema.ts:34,42-46`
- Scrapers already populate salary data:
  - JobSpy: `orchestrator/src/server/services/jobspy.ts:77-106,293-320`
  - UKVisaJobs: `orchestrator/src/server/services/ukvisajobs.ts:94-97,121`
  - Manual jobs: `orchestrator/src/server/services/manualJob.ts:41,177`

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Very long salary strings break layout | Low | Low | Parent container already handles truncation via CSS. Test with edge cases. |
| Inconsistent salary formatting across sources | Medium | Low | Use existing formatted `salary` field which is already normalized by scrapers. |
| Placeholder text ("Salary not listed") adds visual noise | Medium | Low | Use same muted styling as other metadata; easily changed if feedback is negative. |
| Missing salary data for many jobs makes feature less useful | Medium | Low | Expected. Still valuable for jobs that do have salary. Shows transparency when data is missing. |

---

## Alternatives Considered

### Alternative 1: Only show salary when data exists (omit line entirely)

- **Description:** Don't render salary line at all when `job.salary` is null/empty
- **Pros:** 
  - Cleaner UI when data is missing
  - Less visual noise
  - Simpler implementation (one less conditional)
- **Cons:** 
  - Users can't distinguish between "no salary data" vs "didn't check yet"
  - Inconsistent line count between jobs makes scanning harder
  - Less transparent about data availability
- **Decision:** Rejected. Showing "Salary not listed" provides transparency and consistent layout. User preference was to show placeholder.

### Alternative 2: Add salary filtering/sorting controls

- **Description:** Add UI controls to filter jobs by salary range or sort by salary amount
- **Pros:**
  - More powerful feature
  - Could help users find high-value opportunities faster
  - Leverages structured salary data (min/max amounts)
- **Cons:**
  - Much larger scope (requires new UI components, filtering logic)
  - Many jobs may not have salary data, making filters less useful
  - Sorting by salary requires parsing/normalizing amounts (complex)
- **Decision:** Rejected for v1. Display is sufficient initial improvement. Can revisit filtering as future enhancement if user feedback indicates it's needed.

### Alternative 3: Use salary icon in job list items

- **Description:** Add DollarSign icon next to salary text (matching JobHeader pattern)
- **Pros:**
  - Visual consistency with JobHeader
  - Easier to scan for salary at a glance
  - Follows established iconography pattern
- **Cons:**
  - Takes up horizontal space in already-constrained list items
  - Adds visual weight to tertiary metadata
  - User preference was for plain text
- **Decision:** Rejected. Plain text keeps job list items clean and maximizes space for content. Icons reserved for preview panes where space is less constrained.

---

## Non-Goals (v1)

Explicitly out of scope for this PRD:

- **Salary filtering/sorting** - Would require additional UI controls and complex logic to handle missing data, different currencies, and time periods. Deferred until user feedback indicates this is needed.
- **Salary normalization/conversion** - Converting different currencies or intervals (hourly/monthly/yearly) to common format. Current formatted strings are sufficient for v1.
- **Salary editing in UI** - Users cannot edit salary information directly. Salary data comes from scrapers only. Manual editing could be added later if needed.
- **Salary-based notifications** - No alerts or highlights for jobs above certain thresholds. This is a passive display feature only.
- **Historical salary tracking** - No tracking of salary changes over time if a job listing is updated. Current value only.

---

## Interface Specifications

### UI Component Changes

**Component:** JobListPanel  
**File:** `orchestrator/src/client/pages/orchestrator/JobListPanel.tsx`

**Current structure (lines 84-92):**
```tsx
<div className="min-w-0 flex-1">
  <div className="truncate text-sm leading-tight">
    {job.title}
  </div>
  <div className="truncate text-xs text-muted-foreground mt-0.5">
    {job.employer}
    {job.location && <span className="before:content-['_in_']">{job.location}</span>}
  </div>
</div>
```

**New structure (with salary):**
```tsx
<div className="min-w-0 flex-1">
  <div className="truncate text-sm leading-tight">
    {job.title}
  </div>
  <div className="truncate text-xs text-muted-foreground mt-0.5">
    {job.employer}
    {job.location && <span className="before:content-['_in_']">{job.location}</span>}
  </div>
  <div className="truncate text-xs text-muted-foreground mt-0.5">
    {job.salary || "Salary not listed"}
  </div>
</div>
```

**Visual example:**
```
🟢  Senior Software Engineer                              85
    Acme Corporation in London
    £50,000-70,000 / year

🟢  Product Manager                                       78
    TechCorp in Remote
    Salary not listed
```

**Component behavior:**
- Always renders salary line (third line)
- Shows `job.salary` value if truthy
- Shows "Salary not listed" if `job.salary` is null/empty/undefined
- Text naturally truncates if exceeding container width
- Maintains consistent vertical spacing with `mt-0.5`

**States:**
- **Salary available:** Displays formatted salary string (e.g., "£50,000-70,000 / year")
- **Salary missing:** Displays "Salary not listed"
- **Long salary:** Text truncates with ellipsis via CSS

---

## Documentation Requirements

- [ ] No user-facing documentation needed (UI change is self-explanatory)
- [ ] No API documentation updates needed (no API changes)
- [ ] Update internal code comments in JobListPanel.tsx if helpful
- [ ] No architecture decision records needed (minor UI enhancement)

---

## Open Questions

| Question | Owner | Due Date | Status |
|----------|-------|----------|--------|
| Should "Salary not listed" text be configurable/translatable? | Devin | N/A | Resolved - No i18n needed for v1 |
| Should we track analytics on how many jobs have vs don't have salary data? | Devin | N/A | Resolved - No analytics needed for v1 |

---

## Appendix

### Glossary

- **JobListPanel:** The left sidebar component showing the scrollable list of jobs
- **JobHeader:** Reusable component showing job metadata (title, employer, salary, etc.) at the top of preview panes
- **DecideMode:** Preview panel for jobs in "discovered" status (before tailoring)
- **ReadyPanel:** Preview panel for jobs in "ready" status (after PDF generation)
- **Job.salary:** Formatted salary string field (e.g., "GBP 50000-70000 / year")
- **Scraper:** Backend services that fetch job data from external sources (JobSpy, UKVisaJobs, Gradcracker)

### References

- Existing codebase exploration from planning phase
- Job type definition: `orchestrator/src/shared/types.ts:128-198`
- Salary scraping implementation: `orchestrator/src/server/services/jobspy.ts:77-106`
- Current salary display: `orchestrator/src/client/components/JobHeader.tsx:247-252`
