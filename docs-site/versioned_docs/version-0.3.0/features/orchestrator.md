---
id: orchestrator
title: Orchestrator
description: Job states, ready flow, and PDF generation/regeneration behavior.
sidebar_position: 1
---

## What it is

The Orchestrator is the primary jobs workspace in JobOps.

![Orchestrator jobs workspace](/img/features/orchestrator-jobs.png)

It controls:

- job lifecycle states
- manual and automatic ready flow
- PDF generation and regeneration
- handoff to post-application tracking

Job states:

- `discovered`: found by crawler/import, not tailored yet
- `processing`: tailoring and/or PDF generation in progress
- `ready`: tailored PDF generated and ready to apply
- `applied`: marked as applied
- `skipped`: explicitly excluded from active queue
- `expired`: deadline passed

## Why it exists

Orchestrator centralizes the transition from discovered opportunities to application-ready artifacts.

It exists to ensure:

- a consistent path from discovery to tailored output
- clear status transitions across manual and automated workflows
- predictable regeneration behavior when job data changes
- faster external research from the Ready tab with prebuilt search links for LinkedIn, GitHub, and broader web results
- one place to filter and sort jobs across every orchestrator tab

## How to use it

### Intended ready flow

1. Manual flow:
   1. Job starts in `discovered`.
   2. Open the job and choose Tailor.
   3. Edit JD/tailored fields/project picks.
   4. Click **Finalize & Move to Ready**.
2. Auto flow:
   1. Pipeline scores discovered jobs.
   2. Top jobs above threshold are auto-processed.
   3. Jobs move directly to `ready` with generated PDFs.

### Using the Filters panel

The main jobs page has a `Filters` button on the top-right next to `Search`.

Use it when you need to narrow the current tab without changing tabs.

What the panel includes:

- source filters
- sponsor status filters
- salary filters
- date filters
- sorting controls

Date filters work on every jobs tab:

- `Ready`
- `Discovered`
- `Applied`
- `All Jobs`

Available date dimensions:

- `Ready`
- `Applied`
- `Closed`
- `Discovered`

Each selected date dimension uses the same range:

- quick presets: `7`, `14`, `30`, `90` days
- custom `Start date` and `End date`

Jobs match when they fit the current tab and at least one selected date dimension falls in range.

### Sorting by date

The sort section includes `Sort by Date`.

Use it with:

- `Most recent`
- `Least recent`

Date sorting follows the active date-filter context. If multiple date dimensions are enabled, JobOps uses this priority:

1. `Ready`
2. `Applied`
3. `Closed`
4. `Discovered`

If a job does not have the first selected timestamp, JobOps falls back to the next available date in that order.

### Ghostwriter availability

Ghostwriter is available in `discovered` and `ready` job views.

For details, see [Ghostwriter](/docs/next/features/ghostwriter).

### Ready tab search links

In the `ready` view, JobOps can show prebuilt search links based on the current job's employer, title, and skills.

This enables you to:

- quickly open Google searches for likely LinkedIn profiles tied to the company and target skills
- search GitHub for matching public profiles or repositories without rewriting the query yourself
- run a broader web search to gather context before applying

Open the **search links** row in the Ready summary to reveal the generated links.

### Opening documentation from the sidebar

1. Open the sidebar menu.
2. In the footer section under `Version vX.Y.Z`, click **Documentation**, which opens the locally hosted docs in a new tab.

### Generating PDFs

PDF generation uses:

- base resume selected from RxResume
- job description
- tailored summary/headline/skills/projects
- the configured PDF renderer (`rxresume` export or local LaTeX via `tectonic`)

Common paths:

- Discovered to finalization: `POST /api/jobs/actions` with `{ "action": "move_to_ready", "jobIds": ["<jobId>"] }`
- Ready regeneration: `POST /api/jobs/:id/generate-pdf`

### Regenerating PDFs after edits (copy-pasteable examples)

If JD or tailoring changes, regenerate PDF to keep output in sync.

```bash
curl -X PATCH "http://localhost:3001/api/jobs/<jobId>" \
  -H "content-type: application/json" \
  -d '{
    "jobDescription": "<new JD>",
    "tailoredSummary": "<optional>",
    "tailoredHeadline": "<optional>",
    "tailoredSkills": [{"name":"Backend","keywords":["TypeScript","Node.js"]}],
    "selectedProjectIds": "p1,p2"
  }'
```

```bash
curl -X POST "http://localhost:3001/api/jobs/<jobId>/summarize?force=true"
curl -X POST "http://localhost:3001/api/jobs/<jobId>/generate-pdf"
```

### External payload and sanitization defaults

- LLM prompts send minimized profile/job fields.
- Webhooks are sanitized and whitelisted by default.
- Logs and error details are redacted/truncated by default.
- Correlation fields include `requestId`, and when available `pipelineRunId` and `jobId`.

## Common problems

### Job is stuck in `processing`

- `processing` is transient; failures generally revert the job to `discovered`.
- Check run logs and retry generation.

### PDF does not reflect recent edits

- Run summarize with `force=true` after changing the JD/tailoring.
- Regenerate PDF after summarize completes.

### Reopen skipped/applied jobs

- Patch `status` back to `discovered` to return the job to the active queue.

### Date filter returns no jobs

- Open `Filters` and confirm at least one date dimension is selected.
- Check that your date range matches the lifecycle timestamp you care about.
- Remember that `Applied` still means jobs currently in the `applied` status, while `All Jobs` can be used for broader historical browsing.

## Related pages

- [Pipeline Run](/docs/next/features/pipeline-run)
- [Ghostwriter](/docs/next/features/ghostwriter)
- [Reactive Resume](/docs/next/features/reactive-resume)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Job Search Bar](/docs/next/features/job-search-bar)
