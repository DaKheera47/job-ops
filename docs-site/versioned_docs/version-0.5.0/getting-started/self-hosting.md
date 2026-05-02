---
id: self-hosting
title: Self-Hosting (Docker Compose)
description: Deploy JobOps with Docker Compose and configure onboarding integrations.
sidebar_position: 1
---

The easiest way to run JobOps is via Docker Compose. The app is self-configuring and guides you through setup on first launch.

## Prerequisites

- Docker Desktop or Docker Engine + Compose v2

## 1) Start the stack

No environment variables are required to boot:

```bash
docker compose up -d
```

This pulls the pre-built image from GHCR and starts the API, UI, and scrapers in one container.

To build locally instead:

```bash
docker compose up -d --build
```

If GitHub rate limits the Camoufox download during local builds, set an
optional `GITHUB_TOKEN` in your shell or `.env` first:

```bash
echo "GITHUB_TOKEN=ghp_your_token_here" >> .env
docker compose up -d --build
```

JobOps passes this token to the Docker build as a BuildKit secret only for the
Camoufox download step. It is not stored in the runtime container
environment.

## 2) Access the app and onboard

Open:

- **Dashboard**: `http://localhost:3005`

The onboarding wizard helps you validate and save:

1. **LLM Provider**: OpenRouter by default (or OpenAI/Gemini/local URL).
2. **Import your current resume**: Either upload a PDF/DOCX into JobOps or choose the Reactive Resume option and connect with your v5 API key.
3. **Search terms**: JobOps generates a first list of job-title search terms from your selected resume. Edit or regenerate them before saving.
4. **First-run account**: Create the first username/password account. This account becomes the system admin and owns the initial private workspace.

Settings and user accounts are saved to the local database. If you are upgrading an older single-user install, JobOps migrates existing rows into one default private workspace. When `BASIC_AUTH_USER` and `BASIC_AUTH_PASSWORD` are present during that migration, they seed the first system admin account; otherwise the sign-in screen requires first-run setup before private APIs are usable.

System admins can create more users from **Settings → Environment & Workspaces**. Each created user receives a separate private workspace with isolated jobs, settings, resumes, integrations, PDFs, pipeline runs, chat, analytics, and post-application data.

## Codex sign-in

For full Codex auth troubleshooting (including device-code authorization errors), see:

- [Codex Authentication](/docs/next/getting-started/codex-auth)

## Gmail OAuth (Tracking Inbox)

If you want Gmail integration, configure OAuth credentials.

### 1) Create Google OAuth credentials

In Google Cloud:

1. Configure OAuth consent screen.
2. Enable Gmail API.
3. Create OAuth client ID (`Web application`).
4. Add redirect URI:
  - `http://localhost:3005/oauth/gmail/callback`
  - Or your production URL, for example `https://your-domain.com/oauth/gmail/callback`

### 2) Configure environment variables

- `GMAIL_OAUTH_CLIENT_ID` (required)
- `GMAIL_OAUTH_CLIENT_SECRET` (required)
- `GMAIL_OAUTH_REDIRECT_URI` (optional, recommended in production)

### 3) Restart and connect

- Restart container
- Open Tracking Inbox and click **Connect Gmail**

For a full step-by-step setup, exact scope requirements, and troubleshooting, see:

- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)

## Email-to-job matching overview

```mermaid
flowchart TD
    A[Recruitment email arrives in Gmail] --> B[Smart Router AI analyzes content]
    B --> C{How confident is the match?}

    C -->|95-100%| D[Auto-linked to job]
    D --> E[Timeline updated automatically]

    C -->|50-94%| F[Goes to Inbox for review with suggested job match]

    C -->|<50%| G{Is it relevant?}
    G -->|Yes| H[Goes to Inbox as orphan]
    G -->|No| I[Ignored]

    F --> J{User review}
    H --> J
    J -->|Approve| K[Linked to job + timeline update]
    J -->|Ignore| L[Marked not relevant]
```

## Persistent data

`./data` bind-mount stores:

- SQLite DB: `data/jobs.db`
- Generated PDFs: `data/pdfs/`
- Cloudflare challenge cookies: `data/cloudflare-cookies/`

## Public demo mode

Set `DEMO_MODE=true` for sandbox deployments.

Behavior in demo mode:

- Works locally: browsing/filtering/status/timeline edits
- Simulated: pipeline run/summarize/process/rescore/pdf/apply
- Blocked: settings writes, DB clear, backups
- Auto-reset: every 6 hours

## Updating

```bash
git pull
docker compose pull
docker compose up -d
```

## Self-hosted Reactive Resume

If you self-host Reactive Resume, set:

- `RXRESUME_URL=http://rxresume.local.net`
- `RXRESUME_API_KEY=...` (or configure `rxresumeApiKey` in JobOps Settings)



## Local LaTeX PDF rendering

JobOps supports 2 PDF renderers:

- `rxresume`: export the final PDF through RxResume
- `latex`: render locally from tailored resume data using LaTeX and `tectonic`

When using the LaTeX renderer:

- The Docker image installs `tectonic` for you.
- For non-Docker local runs, install `tectonic` yourself and optionally set `TECTONIC_BIN` if it is not on your `PATH`.

RxResume remains the source of truth for base resume data, project visibility, and tailoring inputs in both modes.
