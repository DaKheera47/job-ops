---
id: manual
title: Manual Import Extractor
description: Import jobs from pasted descriptions and run AI-assisted inference.
sidebar_position: 4
---

Manual import lets users add jobs that automated scrapers miss.

## Big picture

User pastes raw description, AI infers structure, user reviews edits, then import saves the job. By default the import also tailors and scores the job; this can be skipped per-import (or globally via Settings) so the job lands in Discovered and can be tailored later.

## 1) Input

Manual import accepts:

- plain text job descriptions
- raw HTML job descriptions
- job links/URLs

When a URL is provided, backend fetch attempts depend on whether the page can be resolved with `curl`. Some job sites block or heavily script content, so certain links will not resolve cleanly.

## 2) AI inference

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

## 3) Review and edit

User reviews inferred fields and corrects missing/wrong values.

## 4) Storage and scoring

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
