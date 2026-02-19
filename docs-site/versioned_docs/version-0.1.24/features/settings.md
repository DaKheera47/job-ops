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
- Display and Ghostwriter defaults
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

### Ghostwriter

![Ghostwriter settings section](/img/features/settings-ghostwriter-section.png)

- Set global writing defaults:
  - Tone
  - Formality
  - Constraints
  - Do-not-use terms

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

- [Reactive Resume](./reactive-resume)
- [Database Backups](../getting-started/database-backups)
- [Overview](./overview)
- [Orchestrator](./orchestrator)
- [Ghostwriter](./ghostwriter)
- [Self-Hosting](../getting-started/self-hosting)
