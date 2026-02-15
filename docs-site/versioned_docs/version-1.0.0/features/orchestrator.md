---
id: orchestrator
title: Orchestrator
description: Job states, ready flow, and PDF generation/regeneration behavior.
sidebar_position: 1
---

This guide explains job states, how jobs become ready, and how PDF generation works.

## Job states

- `discovered`: Found by crawler/import, not tailored yet.
- `processing`: Tailoring and/or PDF generation in progress.
- `ready`: Tailored PDF generated and ready to apply.
- `applied`: Marked as applied.
- `skipped`: Explicitly excluded from active queue.
- `expired`: Deadline passed.

## Intended ready flow

### 1) Manual flow

1. Job starts in `discovered`.
2. Open in Discovered panel and choose Tailor.
3. Edit JD/tailored fields/project picks.
4. Click **Finalize & Move to Ready**.

### 2) Auto flow

1. Pipeline scores discovered jobs.
2. Top jobs above threshold are auto-processed.
3. Jobs move directly to `ready` with generated PDFs.

## Ghostwriter

Ghostwriter is available in `discovered` and `ready` job views.

For details, see [Ghostwriter](/docs/features/ghostwriter).

## Generating PDFs (first time)

PDF generation uses:

- Base resume selected from RxResume
- Job description
- Tailored summary/headline/skills/projects

Common paths:

- **Discovered → Tailor → Finalize**
  - `POST /api/jobs/:id/process`
- **Ready → Regenerate PDF**
  - `POST /api/jobs/:id/generate-pdf`

## Regenerating PDFs after edits

If JD or tailoring changes, regenerate PDF to keep output in sync.

### API flow

```bash
PATCH /api/jobs/:id
{
  "jobDescription": "<new JD>",
  "tailoredSummary": "<optional>",
  "tailoredHeadline": "<optional>",
  "tailoredSkills": "[{\"name\":\"Backend\",\"keywords\":[\"TypeScript\",\"Node.js\"]}]",
  "selectedProjectIds": "p1,p2"
}
```

```bash
POST /api/jobs/:id/summarize?force=true
POST /api/jobs/:id/generate-pdf
```

## Post-application tracking

For inbox routing flow and setup, see [Post-Application Tracking](/docs/features/post-application-tracking).

## Notes and gotchas

- `processing` is transient. On PDF failure, job reverts to `discovered`.
- PDFs are served at `/pdfs/resume_<jobId>.pdf` with cache-bust on `updatedAt`.
- `skipped`/`applied` jobs can be reopened by patching `status` to `discovered`.

## External payload and sanitization defaults

- LLM prompts send minimized profile/job fields.
- Webhooks are sanitized and whitelisted by default.
- Logs and error details are redacted/truncated by default.
- Correlation fields include `requestId`, and when available `pipelineRunId` and `jobId`.
