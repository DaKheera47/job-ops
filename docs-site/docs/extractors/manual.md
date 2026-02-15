---
id: manual
title: Manual Import Extractor
description: Import jobs from pasted descriptions and run AI-assisted inference.
sidebar_position: 4
---

Manual import lets users add jobs that automated scrapers miss.

## Big picture

User pastes raw description, AI infers structure, user reviews edits, then import saves and scores the job.

## 1) Input

User pastes a job description in the **Manual Import** UI.

## 2) AI inference

Endpoint:

- `POST /api/manual-jobs/infer`

Service:

- `orchestrator/src/server/services/manualJob.ts`

Behavior:

- Sends raw text to configured LLM
- Extracts structured fields (title, employer, location, salary, etc.)
- Returns inferred JSON for user review

If no LLM key is configured, inference is skipped and user can fill fields manually.

## 3) Review and edit

User reviews inferred fields and corrects missing/wrong values.

## 4) Storage and scoring

Import endpoint:

- `POST /api/manual-jobs/import`

On import:

- Generates unique job ID if URL absent
- Stores source as `manual`
- Triggers async suitability scoring
- Persists score and reason
