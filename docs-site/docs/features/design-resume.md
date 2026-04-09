---
id: design-resume
title: Design Resume
description: Edit the local resume document that JobOps uses for tailoring, scoring, and PDF generation.
sidebar_position: 4
---

## What it is

Design Resume is JobOps' local-first resume editor.

It stores an exact Reactive Resume v5 document inside JobOps. JobOps does not convert that document into a separate internal resume format. JobOps uses this local RR v5 document as the primary source of truth for:

- profile context
- project catalogs
- tailoring inputs
- scoring inputs
- PDF generation

## Why it exists

Depending on Reactive Resume for every profile lookup, project read, and PDF flow makes JobOps more fragile than it needs to be.

Design Resume reduces that dependency by letting you:

- import from Reactive Resume once
- keep editing locally inside JobOps
- preserve the original Reactive Resume v5 structure
- export back out when needed

## How to use it

1. Open **Design Resume** from the main navigation.
2. If this is your first time, click **Import from Reactive Resume**.
3. Edit the left-panel fields directly.
4. Watch for the local save indicator in the header.
5. Use **Export** when you want the current Reactive Resume v5 JSON.

Current v1 scope:

- left-panel editing only
- local editing of the stored RR v5 document
- export of the stored RR v5 document
- PDF preview and PDF download using the selected renderer

## Common problems

- Import button fails:
  Verify your Reactive Resume mode, URL, credentials, and selected base resume in **Settings**.
- You already had a local Design Resume from an older JobOps build:
  Re-import from a Reactive Resume v5 base resume. Older local documents are no longer auto-converted.
- Changes do not appear in a generated PDF:
  Re-run tailoring or PDF generation after the local save finishes.
- Picture upload fails:
  Use `png`, `jpeg`, or `webp` images.
- You changed the upstream resume and want that copied over:
  Use **Re-import** to replace the local document with the current Reactive Resume base resume.

## Related pages

- [Reactive Resume](./reactive-resume)
- [Settings](./settings)
- [Orchestrator](./orchestrator)
