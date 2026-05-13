---
id: design-resume
title: Resume Studio
description: Edit the local resume document that JobOps uses for tailoring, scoring, and PDF generation.
sidebar_position: 4
---

## What it is

Resume Studio is JobOps' local-first resume editor.

It stores an exact Reactive Resume v5 document inside JobOps. JobOps does not convert that document into a separate internal resume format. JobOps uses this local RR v5 document as the primary source of truth for:

- profile context
- project catalogs
- tailoring inputs
- scoring inputs
- PDF generation

## Why it exists

Depending on Reactive Resume for every profile lookup, project read, and PDF flow makes JobOps more fragile than it needs to be.

Resume Studio reduces that dependency by letting you:

- import from Reactive Resume once
- keep editing locally inside JobOps
- preserve the original Reactive Resume v5 structure
- export back out when needed

## How to use it

1. Open **Resume Studio** from the main navigation.
2. If this is your first time, click **Import from Reactive Resume**.
3. Edit the left-panel fields directly.
4. Use the sparkle button beside eligible fields when you want a focused AI draft.
5. Watch for the local save indicator in the header.
6. Use **Export** when you want the current Reactive Resume v5 JSON.

AI-assisted field editing is available for writing-heavy fields such as headline, summary, item names/titles/positions, rich descriptions, and skill keywords. It is not shown for contact details, URLs, picture settings, icons, toggles, or numeric style fields.

The AI assistant is ephemeral. Closing the field assistant clears that short conversation. Empty fields are filled automatically when the AI response arrives; fields that already contain content show an **Apply** action so you can review the suggestion before it changes the resume.

AI field editing uses the same LLM connection, tailoring model overrides, writing style, and output language settings used by resume tailoring. It edits the reusable baseline resume only; job-specific rewrites still belong in job tailoring and Ghostwriter.

When Resume Studio changes, ready jobs with system-generated PDFs are queued for automatic regeneration. Until the queue catches up, those jobs show a `PDF stale` indicator and keep the old PDF available as **View old PDF** / **Download old PDF**.

Current v1 scope:

- left-panel editing only
- local editing of the stored RR v5 document
- ephemeral AI-assisted editing for eligible fields
- export of the stored RR v5 document
- PDF preview and PDF download using the selected renderer

## Common problems

- Import button fails:
  Verify your Reactive Resume mode, URL, credentials, and selected base resume in **Settings**.
- You already had a local Resume Studio document from an older JobOps build:
  Re-import from a Reactive Resume v5 base resume. Older local documents are no longer auto-converted.
- Changes do not appear in a generated PDF:
  Ready jobs that already use system-generated PDFs are auto-queued for regeneration after Resume Studio edits. If a job shows `PDF stale`, JobOps is keeping the old PDF available while the new one is queued or regenerating.
- AI field editing fails:
  Check the LLM provider and tailoring model settings in **Settings**. The assistant uses the same model configuration as resume tailoring.
- Picture upload fails:
  Use `png`, `jpeg`, or `webp` images.
- You changed the upstream resume and want that copied over:
  Use **Re-import** to replace the local document with the current Reactive Resume base resume.

## Related pages

- [Reactive Resume](./reactive-resume)
- [Settings](./settings)
- [Orchestrator](./orchestrator)
