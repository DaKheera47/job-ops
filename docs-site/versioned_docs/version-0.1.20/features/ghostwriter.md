---
id: ghostwriter
title: Ghostwriter
description: Context-aware per-job AI chat assistant behavior and API surface.
sidebar_position: 2
---

Ghostwriter is the per-job AI chat assistant in JobOps.

## What it is for

Ghostwriter uses:

- Current job description and metadata
- Reduced profile snapshot
- Global writing style settings

Typical use cases:

- Role-specific answer drafting
- Cover letter and outreach drafts
- Interview prep tied to the JD
- Rephrasing with tone constraints

## Where it appears

- Available from job details in `discovered` and `ready`
- Right-side drawer UX
- One persistent conversation per job

## Writing style settings impact

Global settings affecting generations:

- `Tone`
- `Formality`
- `Constraints`
- `Do-not-use terms`

Defaults:

- Tone: `professional`
- Formality: `medium`
- Constraints: empty
- Do-not-use terms: empty

## Context and safety model

- Job snapshot is truncated to fit prompt budget.
- Profile snapshot includes relevant slices only.
- System prompt enforces read-only assistant behavior.
- Logging stores metadata, not full prompt/response dumps.

## API surface

- `GET /api/jobs/:id/chat/messages`
- `POST /api/jobs/:id/chat/messages` (streaming)
- `POST /api/jobs/:id/chat/runs/:runId/cancel`
- `POST /api/jobs/:id/chat/messages/:assistantMessageId/regenerate` (streaming)

Compatibility thread endpoints remain, but UI behavior is one thread per job.
