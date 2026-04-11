---
id: reactive-resume
title: Reactive Resume
description: Configure Reactive Resume as an optional import/export and PDF backend for JobOps.
sidebar_position: 4
---

## What it is

Reactive Resume is now an optional integration in JobOps.

The primary editing surface is **Design Resume**, which stores a local resume document inside JobOps. Reactive Resume is used for:

- importing an existing resume into Design Resume
- exporting JobOps resume JSON back out
- optional upstream PDF export when the `rxresume` PDF renderer is selected

## Why it exists

Most users need a repeatable resume pipeline:

- one canonical structured resume source
- controlled project inclusion rules
- per-job tailored output without manual copy/paste

Reactive Resume still matters because many users already maintain a strong resume there, and its JSON model is compatible with JobOps. Importing that data into Design Resume avoids re-entry while reducing day-to-day dependence on the upstream service.

### Where it fits now

Reactive Resume remains useful because it has a mature editor, established templates, and a JSON-native data model.

Key reasons:

- It is a convenient migration/import source.
- It can still power PDF export if you prefer the upstream renderer.
- Its JSON schema remains a stable interchange format for JobOps.

For everyday editing inside JobOps, use [Design Resume](./design-resume).

## Core concepts

### Import source

Your configured **base resume** in Reactive Resume is used as the import source for Design Resume when you choose **Import from Reactive Resume**.

After import, JobOps uses the local Design Resume for:

- profile extraction
- project catalog extraction
- tailoring and scoring context
- local PDF generation
- future in-app resume design work

If you use the `rxresume` PDF renderer, JobOps can still send the tailored JSON through Reactive Resume at export time.

### Project catalog

JobOps reads projects from `sections.projects.items` in the local Design Resume document.

Each project is identified by:

- `id`
- `name`
- `description`
- `date`
- `visible` (visible in base resume)

### Project selection controls

The Settings UI supports 3 controls:

- **Must Include**: always include these projects.
- **AI Selectable**: pool of projects AI can pick from.
- **Max Projects**: final cap for included projects.

At generation time:

1. Must-include projects are added first.
2. AI picks up to remaining slots from AI-selectable projects.
3. Final visible projects are applied to the generated resume.

## Setup and configuration

### Account requirements (important)

Before connecting Reactive Resume to JobOps:

1. Generate an API key in your Reactive Resume account.
2. Configure `rxresumeApiKey` in **Settings → Reactive Resume** (or set `RXRESUME_API_KEY` in your environment).


### 1) Configure Reactive Resume access

Configure in **Settings → Reactive Resume**:

- `rxresumeUrl` (optional shared URL for cloud or self-hosted deployments)
- `rxresumeApiKey`

Or via environment variables:

- `RXRESUME_API_KEY`
- optional `RXRESUME_URL`

If you leave the URL blank in the dashboard, JobOps uses `RXRESUME_URL` when it is set; if not set, it falls back to the public cloud default (https://rxresu.me).

### Save-time validation

When you save Reactive Resume credentials or the shared URL in Settings:

1. JobOps validates your API key.
2. Invalid credentials or other `4xx` configuration failures block the save and show a persistent inline error.
3. Temporary network failures, timeouts, or upstream `5xx` errors show a persistent inline warning, but the save still succeeds.

### 2) Select base resume

In **Settings → Reactive Resume**:

1. Click refresh to fetch resumes.
2. Select the template/base resume.
3. Save settings.

### 3) Import into Design Resume

1. Open **Design Resume** in the left navigation.
2. Click **Import from Reactive Resume**.
3. Wait for JobOps to create the local Design Resume document.

After that import, JobOps reads resume context locally by default.

### 4) Configure project behavior

In **Settings → Reactive Resume**:

1. Set `Max projects`.
2. Mark projects as **Must Include** where needed.
3. Mark remaining projects as **AI selectable**.
4. Save settings.

## Runtime behavior

### During PDF generation

High-level flow:

1. Load the local Design Resume document.
2. Apply tailored summary/headline/skills.
3. Compute final visible projects from your selection rules.
4. Optionally rewrite outbound links to tracer links (per-job toggle).
5. Normalize the tailored resume data into JobOps' renderer document model.
6. Render the PDF with the configured renderer:
   - RxResume export
   - Local LaTeX with `tectonic`

### Resume-data caching

JobOps caches successful Reactive Resume resume fetches in memory for 5 minutes when upstream access is needed.

This now mainly affects import/export operations, settings resume lookup, and the optional upstream PDF renderer.

### Per-job tracer links

Before generating a PDF, each job can enable/disable tracer links.

- Disabled: original RxResume links remain unchanged.
- Enabled: eligible outbound links are rewritten to `https://<your-host>/cv/<company>-xx` (readable slug + 2-letter suffix).

For background pipeline generation, configure:

- `JOBOPS_PUBLIC_BASE_URL=https://your-host`

Important:

- tracer enablement is gated by readiness checks
- if public host verification fails, enable is blocked until host health is restored
- toggle changes apply on next PDF generation only

### What JobOps changes with AI

Current AI-driven edits are intentionally scoped:

- `summary`
- `headline/title`
- `skills` and keywords
- project **visibility** (enable/disable per project)

### Local renderer dependency

JobOps can generate the final PDF in 2 ways:

- `rxresume`: use the upstream RxResume print/export endpoint
- `latex`: render locally with the Jake Gutierrez-based LaTeX template

Notes:

- Design Resume supplies the structured base resume and project data by default.
- Reactive Resume is only required at render time when you choose the `rxresume` PDF renderer.
- In Docker deployments, `tectonic` is bundled into the image for the LaTeX option.
- In non-Docker local environments, install `tectonic` and optionally set `TECTONIC_BIN` if needed when using the LaTeX option.

## Common problems

- Import fails:
  Check that Reactive Resume credentials, mode, URL, and selected base resume are valid in **Settings**.
- Design Resume is empty:
  Open **Design Resume** and run **Import from Reactive Resume** once.
- PDF export still calls Reactive Resume:
  Switch the PDF renderer to `latex` if you want the full flow to stay local.
- Project lists look stale:
  Re-import from Reactive Resume if you intentionally changed the upstream base resume and want those changes copied into JobOps.

## Related pages

- [Design Resume](./design-resume)
- [Settings](./settings)
- [Tracer Links](./tracer-links)

## API reference

```bash
# Get effective settings (includes resolved resumeProjects and base resume id)
curl "http://localhost:3001/api/settings"
```

```bash
# Save base resume and project controls
curl -X PATCH "http://localhost:3001/api/settings" \
  -H "content-type: application/json" \
  -d '{
    "rxresumeBaseResumeId": "resume_id_here",
    "resumeProjects": {
      "maxProjects": 4,
      "lockedProjectIds": ["proj_a"],
      "aiSelectableProjectIds": ["proj_b","proj_c","proj_d"]
    }
  }'
```

```bash
# List available Reactive Resume resumes
curl "http://localhost:3001/api/settings/rx-resumes"
```

```bash
# Fetch projects from one RxResume resume
curl "http://localhost:3001/api/settings/rx-resumes/<resumeId>/projects"
```

```bash
# Regenerate PDF for a job after changing settings or resume data
curl -X POST "http://localhost:3001/api/jobs/<jobId>/generate-pdf"
```

## Troubleshooting and FAQ

### RxResume controls are disabled

- Ensure you have set a valid API key.
- Invalid credentials block save and remain visible as an inline error until you edit your API key or URL.
- Temporary Reactive Resume downtime shows an inline warning, but other settings can still be saved.
- Save settings, then refresh resumes in the Reactive Resume section.

### No resumes appear in dropdown

- Confirm `RXRESUME_API_KEY` / `rxresumeApiKey` is valid for your Reactive Resume instance.
- Confirm the selected Reactive Resume account actually has resumes.

### Project list is empty in settings

- Root cause is usually the source resume on [rxresu.me](https://rxresu.me) having an empty **Projects** section.
- Add projects directly in RxResume first.
- Re-select/refresh the base resume in JobOps and regenerate the PDF.

### Project checkboxes look wrong after changing base resume

- Save after selecting the new base resume.
- Re-open Reactive Resume section and verify project IDs from that resume.
- Re-run PDF generation to apply the new project map.

### Changes did not affect an already generated PDF

- Settings changes apply to new generation runs.
- Regenerate PDFs for already-ready jobs.

### PDF generation fails because the renderer is unavailable

- Ensure `tectonic` is installed on the machine running JobOps.
- If the binary is installed outside your normal shell `PATH`, set `TECTONIC_BIN` to the executable path.
- Re-run PDF generation after fixing the local renderer dependency.

## Best practices

- Keep base resume projects complete and up to date in RxResume.
- Use **Must Include** sparingly for cornerstone projects.
- Keep AI-selectable pool broad enough for job-specific relevance.
- After major resume edits, regenerate PDFs for active high-priority jobs.

### Add “context projects” even if they are usually hidden

The LLM only knows what exists in your resume data.

That means there is real value in adding additional projects in RxResume, even if you keep them hidden by default:

- They increase the AI’s context about your skills and range.
- They can be toggled on only when relevant to a role.

Example:

- If your main background is not Android, but you have one credible Android side project, include it in RxResume, but keep it hidden by default.
- For a mobile role, the AI can enable that project automatically based on the job description.

## Related pages

- [Settings](./settings)
- [Orchestrator](./orchestrator)
- [Ghostwriter](./ghostwriter)
- [Self-Hosting](../getting-started/self-hosting)
