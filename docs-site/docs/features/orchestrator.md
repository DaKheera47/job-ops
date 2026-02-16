---
id: orchestrator
title: Orchestrator
description: Job states, ready flow, and PDF generation/regeneration behavior.
sidebar_position: 1
---

## What it is

The Orchestrator is the primary jobs workspace in JobOps.

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

### Ghostwriter availability

Ghostwriter is available in `discovered` and `ready` job views.

For details, see [Ghostwriter](/docs/next/features/ghostwriter).

### Generating PDFs

PDF generation uses:

- base resume selected from RxResume
- job description
- tailored summary/headline/skills/projects

Common paths:

- Discovered to finalization: `POST /api/jobs/:id/process`
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

## Related pages

- [Pipeline Run](/docs/next/features/pipeline-run)
- [Ghostwriter](/docs/next/features/ghostwriter)
- [Reactive Resume](/docs/next/features/reactive-resume)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
