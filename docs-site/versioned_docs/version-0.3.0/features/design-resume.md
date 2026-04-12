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

- upload a PDF or DOCX resume directly into JobOps
- import from Reactive Resume once
- keep editing locally inside JobOps
- preserve the original Reactive Resume v5 structure
- export back out when needed

## How to use it

1. Open **Design Resume** from the main navigation.
2. If this is your first time, choose one of these import paths:
   - Click **Import File** to upload a `pdf` or `docx` resume.
   - Click **Import RxResume** if you already connected Reactive Resume and selected a base resume.
3. Wait for JobOps to create or replace the local Design Resume.
4. Edit the left-panel fields directly.
5. Watch for the local save indicator in the header.
6. Use **Export** when you want the current Reactive Resume v5 JSON.

Import defaults and constraints:

- File import supports `pdf` and `docx` only.
- File import sends the uploaded file directly to your configured AI provider as an attached file.
- There is no OCR or local text-extraction fallback. If the configured model cannot accept attached files, JobOps returns an error instead.
- Uploaded or re-imported resumes replace the current local Design Resume and clear old Design Resume assets.
- Onboarding treats Reactive Resume as optional. You can upload a resume to begin, then connect Reactive Resume later if you want upstream PDF export.

Current v1 scope:

- left-panel editing only
- local editing of the stored RR v5 document
- export of the stored RR v5 document
- PDF preview and PDF download using the selected renderer

## Common problems

- Import button fails:
  Verify your AI provider supports attached file inputs for `pdf` or `docx`, or confirm your Reactive Resume mode, URL, credentials, and selected base resume in **Settings**.
- File import says the model cannot handle the file directly:
  Switch to a model with native document upload support, then try the import again. JobOps does not fall back to OCR or local text extraction.
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
