---
id: reactive-resume
title: Reactive Resume
description: Configure RxResume integration, base resume selection, and project inclusion behavior for PDF generation.
sidebar_position: 4
---

## What it is

Reactive Resume integration powers JobOps PDF generation.

JobOps uses a selected RxResume base resume as the source of truth, then applies job-specific tailoring (summary, headline, skills, project visibility) before exporting a PDF.

## Why it exists

Most users need a repeatable resume pipeline:

- one canonical resume source
- controlled project inclusion rules
- per-job tailored output without manual copy/paste

Reactive Resume integration provides that workflow end-to-end.

### Why JobOps uses RxResume (instead of building a new editor)

RxResume is a mature, established resume product with strong PDF output quality.

Key reasons:

- ATS-friendly PDF generation is already excellent and battle-tested.
- The editor UX is strong and supports extensive user customization.
- It supports many themes out of the box.
- It has a JSON-native model (import/export), which is critical for JobOps automation.

Because RxResume uses structured JSON, JobOps can safely apply LLM-driven updates to specific sections before generating PDFs.

## Core concepts

### Base resume

Your **base resume** is selected in Settings and used for:

- profile extraction
- project catalog extraction
- PDF generation

If no base resume is selected, profile-dependent features and PDF generation cannot run.

### Project catalog

JobOps reads projects from `sections.projects.items` in the selected RxResume resume.

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

### 1) Configure RxResume credentials

Configure in Settings:

- `rxresumeEmail`
- `rxresumePassword`

Or via environment variables:

- `RXRESUME_EMAIL`
- `RXRESUME_PASSWORD`
- optional `RXRESUME_URL` (defaults to `https://v4.rxresu.me`)

### 2) Select base resume

In **Settings → Reactive Resume**:

1. Click refresh to fetch resumes.
2. Select the template/base resume.
3. Save settings.

### 3) Configure project behavior

In the same section:

1. Set `Max projects`.
2. Mark projects as **Must Include** where needed.
3. Mark remaining projects as **AI selectable**.
4. Save settings.

## Runtime behavior

### During PDF generation

High-level flow:

1. Load selected base resume from RxResume.
2. Apply tailored summary/headline/skills.
3. Compute final visible projects from your selection rules.
4. Create temporary resume in RxResume.
5. Export PDF.
6. Delete temporary resume.

### What JobOps changes with AI

Current AI-driven edits are intentionally scoped:

- `summary`
- `headline/title`
- `skills` and keywords
- project **visibility** (enable/disable per project)

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
# List available RxResume resumes
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

- Ensure RxResume credentials are configured.
- Save settings, then refresh resumes in the Reactive Resume section.

### No resumes appear in dropdown

- Confirm credentials are valid for `rxresu.me`/your configured RxResume URL.
- Confirm the selected RxResume account actually has resumes.

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
