---
id: manual
title: Manual Import Extractor
description: Import jobs from pasted descriptions and run AI-assisted inference.
sidebar_position: 4
---

## What it is

**Add a job** imports a job you already found from a link, pasted description, or text-based PDF.

## Why it exists

It lets you track and tailor opportunities that automated searches miss, without running discovery.

## How to use it

User pastes raw description, AI infers structure, user reviews edits, then import saves the job. By default the import also tailors and scores the job; this can be skipped per-import (or globally via Settings) so the job lands in Discovered and can be tailored later.

### 1) Input

Manual import accepts:

- plain text job descriptions
- raw HTML job descriptions
- text-based PDF job descriptions (local browser extraction)
- job links/URLs
- a list of public job URLs, one per line, in **URL list** mode (up to 25 URLs)

For a URL list, JobOps fetches and analyzes each page one at a time, then shows
the successful results and any failed URLs for review before importing. The
existing single-job flow is unchanged.

When a URL is provided, backend fetch attempts depend on whether the page can be resolved with `curl`. Some job sites block or heavily script content, so certain links will not resolve cleanly.

If you enter a URL and paste the description manually, the URL you entered is preserved through AI inference and takes precedence over any inferred URL.

#### Import a PDF job description

1. Select **Add a job** in the Jobs header and keep **Single job** selected.
2. Choose a file under **PDF job description**. This replaces the description
   below and clears any previous URL so it cannot be attached to a different job.
3. Review and edit the extracted text. Extraction alone does not call AI.
4. Add the job URL, or fill it in during review, then select **Analyze JD**.
5. Review the inferred fields and import. A valid job URL is still required.

The PDF file stays in your browser and is not uploaded or stored. **Analyze JD**
sends the reviewed text to your configured AI provider through the existing
manual-import service. Limits: 10 MB, 100 pages, and 40,000 extracted characters.
Oversized input is rejected rather than silently truncated.

Scanned/image-only PDFs need OCR and are not supported by this input. Use an OCR
tool and paste the resulting text instead. A PDF containing both text and scans
may yield only its text layer; always check the extracted description. Damaged or
password-protected files should be repaired/unlocked first. A failed extraction
keeps the previous description so you can continue manually.

### 2) AI inference

Endpoint:

- `POST /api/manual-jobs/infer`

Service:

- `orchestrator/src/server/services/manualJob.ts`

Behavior:

- Converts the provided input into text context and sends it to the configured LLM
- Extracts structured fields (title, employer, location, salary, etc.)
- Returns inferred JSON for user review

Practical limit:

- The inference quality ceiling is mostly the configured model capability and context behavior. Better model quality generally yields better field extraction.

If no LLM key is configured, inference is skipped and user can fill fields manually.

### 3) Review and edit

User reviews inferred fields and corrects missing/wrong values.

### 4) Storage and scoring

Import endpoint:

- `POST /api/manual-jobs/import`

Request body accepts an optional `skipTailoring` boolean. When omitted, the route falls back to the `autoTailorOnManualImport` workspace setting (default: `true`). The review step in the UI exposes this as the "Tailor automatically after import" checkbox.

On import with tailoring enabled:

- Generates unique job ID if URL absent
- Stores source as `manual`
- Runs the tailoring pipeline (resume + PDF) and persists score and reason
- Job ends in `processing` and progresses to `ready` when tailoring completes

On import with tailoring skipped (`skipTailoring: true` or workspace setting off):

- Generates unique job ID if URL absent
- Stores source as `manual`
- Job lands in `discovered` immediately; no LLM scoring, no PDF render
- Tailoring can be triggered later from the job detail view

## Common problems

- If a job link cannot be fetched, paste the description instead.
- If PDF extraction fails or misses scanned text, use a text-based PDF or paste the description.
- Review inferred fields before adding the job; a valid job URL is required in the review step.

## Related pages

- [Find jobs](/docs/next/features/pipeline-run)
- [Orchestrator](/docs/next/features/orchestrator)
