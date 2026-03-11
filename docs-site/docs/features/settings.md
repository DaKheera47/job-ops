---
id: settings
title: Settings
description: Configure models, webhooks, accounts, backup behavior, scoring, and safety controls.
sidebar_position: 2
---

## What it is

The Settings page is the control center for app-wide behavior.

![Settings page sections](/img/features/settings.png)

It lets you configure:

- LLM provider and models
- Webhook destinations and secret
- Display and writing-style defaults
- Service credentials and basic auth
- Reactive Resume project selection
- Tracer Links readiness verification
- Backup and scoring rules
- Data-clearing actions in the Danger Zone

## Why it exists

Most teams want stable defaults for repeated workflows, without editing environment variables every time.

Settings gives you runtime overrides for the key parts of discovery, scoring, tailoring, and post-application automation.

## How to use it

1. Open **Settings**.
2. Expand each section you want to change.
3. Update values and click **Save Changes**.
4. Re-run the workflow that uses those settings (for example pipeline runs, Ghostwriter, or resume tailoring) to verify behavior.

## Section-by-section guide

### Model

![Model settings section](/img/features/settings-model-section.png)

- Choose provider (`openrouter`, `lmstudio`, `ollama`, `openai`, `gemini`)
- Set provider-specific base URL/API key when required
- Configure default model plus task-specific overrides:
  - Scoring model
  - Tailoring model
  - Project-selection model

### Webhooks

![Webhooks settings section](/img/features/settings-webhooks-section.png)

- Pipeline status webhook: called on run completion/failure
- Job completion webhook: called when a job is marked applied
- Optional webhook secret (sent as bearer token)

### Display Settings

![Display settings section](/img/features/settings-display-section.png)

- Toggle visa sponsor badge visibility in job lists/details

### Writing Style & Language

![Ghostwriter settings section](/img/features/settings-ghostwriter-section.png)

- Pick a preset for a quick starting point
- Set global writing defaults:
  - Tone
  - Formality
  - Output language mode
  - Manual output language
  - Constraints
  - Do-not-use terms
- These settings apply to Ghostwriter and resume tailoring
- Use the output language controls as the primary way to choose generated language
- Choose how AI output language is resolved:
  - `Manual`: always use the language you select, such as English, German, French, or Spanish
  - `Match Resume`: detect the dominant language from your resume/profile content and use that language for generated output
- If language detection is unclear or there is not enough resume/profile text, JobOps falls back to English
- Resume tailoring keeps the exact source wording for ATS-sensitive resume headlines and job titles, even when the rest of the tailored content is generated in the selected language
- Do-not-use terms are model guidance, not a guaranteed output filter

#### Writing Style & Language workflow

Use these steps when you want Ghostwriter and resume tailoring to stay in a specific language:

1. Open **Settings**.
2. Expand **Writing Style & Language**.
3. Choose a preset if you want a starting point for tone and formality.
4. Under the language control, choose one of these modes:
   - **Manual**: pick the output language directly.
   - **Match Resume**: let JobOps infer the language from your resume/profile text.
5. If you chose **Manual**, select the language you want the AI to use.
6. Review the rest of the writing defaults such as tone, formality, constraints, and do-not-use terms.
7. Click **Save Changes**.
8. Run Ghostwriter or start resume tailoring again so the new language preference is applied to new output.

Defaults and constraints:

- `Manual` is best when you always want output in one language regardless of the resume source text.
- `Match Resume` is best when your base resume is already written in the language you want to preserve.
- If JobOps cannot determine a reliable resume/profile language, it safely uses English.
- The generated resume content follows the resolved language, but ATS-sensitive headline and job-title wording stays exact so matching and parsing remain safer.

### Reactive Resume

![Reactive Resume settings section](/img/features/settings-reactive-resume-section.png)

- Select a template/base resume
- Configure project selection behavior:
  - Max projects
  - Must-include projects
  - AI-selectable projects

### Tracer Links

- Verify tracer readiness before enabling per-job tracing
- Shows current status (`Ready`, `Unavailable`, `Unconfigured`, or stale state)
- Displays the effective public base URL and last check time
- Provides **Verify now** for an on-demand health check

Readiness requires:

- a valid public JobOps base URL
- successful reachability of `<public-base-url>/health`
- non-localhost/non-private host setup for public redirect usage

### Environment & Accounts

- Configure service accounts:
  - RxResume email/password
  - UKVisaJobs email/password
  - Adzuna app ID/app key
  - Optional basic authentication for write operations

### Backup

![Backup settings section](/img/features/settings-backup-section.png)

- Enable/disable automatic daily backups
- Configure backup hour (UTC) and max retained backups
- Create or delete backups manually
- See [Database Backups](../getting-started/database-backups) for full backup/restore guidance.

### Scoring Settings

![Scoring settings section](/img/features/settings-scoring-section.png)

- Penalize missing salary data
- Set penalty amount
- Optional auto-skip threshold for low-score jobs
- Block jobs from companies that match configured keyword tokens
- Add custom scoring instructions to tell the AI what to weigh more or less

### Danger Zone

![Danger Zone settings section](/img/features/settings-danger-zone-section.png)

- Clear jobs by selected statuses
- Clear jobs below a score threshold
- Clear the full database

## API examples

```bash
# Get effective settings (defaults + overrides)
curl "http://localhost:3001/api/settings"
```

```bash
# Update settings overrides
curl -X PATCH "http://localhost:3001/api/settings" \
  -H "content-type: application/json" \
  -d '{
    "llmProvider": "openrouter",
    "model": "openai/gpt-4.1-mini",
    "chatStyleTone": "concise",
    "showSponsorInfo": true
  }'
```

```bash
# List and create backups (used by the Backup section)
curl "http://localhost:3001/api/backups"
curl -X POST "http://localhost:3001/api/backups"
```

## Common problems

### Saved value does not seem to apply

- Some settings apply only to new runs/actions after save.
- Re-run scoring/tailoring/pipeline to validate effect.

### Resume tailoring used English instead of my resume language

- Open **Settings → Writing Style & Language** and confirm whether the language mode is set to **Manual** or **Match Resume**.
- If you want a specific language every time, switch to **Manual** and select that language explicitly.
- If you use **Match Resume**, make sure your resume/profile text has enough content in the target language for detection.
- If detection is ambiguous, JobOps falls back to English by design.

### My headline or target job title did not get translated

- This is expected during resume tailoring.
- JobOps intentionally preserves exact headline and job-title wording for ATS safety, even when other tailored sections are generated in another language.
- If you need a different headline or target title, change the source resume/profile text first and then re-run tailoring.

### RxResume controls are disabled

- Configure RxResume credentials in Environment & Accounts first.
- Then refresh available resumes from the Reactive Resume section.

### RxResume projects look empty in the RxResume UI

- Root cause: your resume on [rxresu.me](https://rxresu.me) has an empty **Projects** section.
- Fix in RxResume first: add project entries to the base resume you selected in Settings.
- Then return to JobOps, refresh/select the same base resume in **Reactive Resume**, and regenerate the PDF.
- JobOps preserves current visibility state, but it cannot create missing project content if the source resume has no projects.

### Webhook calls fail

- Verify URL reachability from the server host.
- Confirm auth expectations on the receiver side (including secret/bearer token).

### Tracer links cannot be enabled

- Open **Settings → Tracer Links** and click **Verify now**.
- Ensure `JOBOPS_PUBLIC_BASE_URL` is set for background/pipeline usage.
- Ensure the configured host is publicly reachable and `/health` responds.

## Related pages

- [Reactive Resume](/docs/next/features/reactive-resume)
- [Database Backups](/docs/next/getting-started/database-backups)
- [Overview](/docs/next/features/overview)
- [Orchestrator](/docs/next/features/orchestrator)
- [Ghostwriter](/docs/next/features/ghostwriter)
- [Self-Hosting](/docs/next/getting-started/self-hosting)
