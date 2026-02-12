# Self-Hosting (Docker Compose)

The easiest way to run JobOps is via Docker Compose. The app is self-configuring and will guide you through the setup on your first visit.

## Prereqs

- Docker Desktop or Docker Engine + Compose v2

## 1) Start the stack

No environment variables are strictly required to start. Simply run:

```bash
docker compose up -d
```

This pulls the pre-built image from **GitHub Container Registry (GHCR)** and starts the API, UI, and scrapers in a single container. The image is multi-arch (supports `amd64` and `arm64`), making it compatible with Apple Silicon and Raspberry Pi.

If you want to build it yourself, you can run `docker compose up -d --build`.

## 2) Access the app and Onboard

Open your browser to:

- **Dashboard**: http://localhost:3005

On first launch, you will be greeted by an **Onboarding Wizard**. The app will help you validate and save your configuration:

1.  **LLM Provider**: OpenRouter is the default. Add an API key if required (OpenRouter/OpenAI/Gemini), or configure a local base URL (LM Studio/Ollama).
2.  **PDF Export**: Add your RxResume credentials (used to export PDFs from v4.rxresu.me).
3.  **Template Resume**: Select a base resume from your v4.rxresu.me account.

The app saves these to its persistent database, so you don't need to manage `.env` files for basic setup. All other settings (like search terms, job sources, and more) can also be configured directly in the UI.

Upgrade note: `OPENROUTER_API_KEY` is deprecated. Existing OpenRouter keys are automatically migrated/copied to `LLM_API_KEY` so you don't lose them.

## Gmail OAuth (Post-Application Inbox)

If you want to connect Gmail in the Tracking Inbox page, configure Google OAuth credentials for the API server.

### 1) Create Google OAuth credentials

In Google Cloud:

1. Open your project (or create one), then configure the OAuth consent screen.
2. Enable the Gmail API.
3. Create an OAuth client ID (`Web application` type).
4. Add an authorized redirect URI:
   - `http://localhost:3005/oauth/gmail/callback` (default local setup)
   - or your deployed app URL, for example `https://your-domain.com/oauth/gmail/callback`

### 2) Configure environment variables

Set these on the JobOps container:

- `GMAIL_OAUTH_CLIENT_ID` (required)
- `GMAIL_OAUTH_CLIENT_SECRET` (required)
- `GMAIL_OAUTH_REDIRECT_URI` (optional, recommended for production)
  - If omitted, JobOps derives it from the incoming request host as `/oauth/gmail/callback`.

### 3) Restart and connect

After setting env vars, restart the container and use `Tracking Inbox -> Connect Gmail`.

Notes:

- JobOps requests `gmail.readonly` scope.
- If Google returns no refresh token, disconnect and re-connect to force a fresh consent flow.

## Email-to-Job Matching Overview

When Gmail sync runs, your emails are automatically analyzed and routed. Here's what happens:

```mermaid
flowchart TD
    A[Recruitment email arrives in Gmail] --> B[Smart Router AI analyzes content]
    B --> C{How confident is the match?}

    C -->|95-100%| D[Auto-linked to job]
    D --> E[Timeline updated automatically]

    C -->|50-94%| F[Goes to Inbox for review<br/>with suggested job match]

    C -->|<50%| G{Is it relevant?}
    G -->|Yes| H[Goes to Inbox as orphan<br/>relevant but job unclear]
    G -->|No| I[Ignored - not job-related]

    F --> J{You review in Inbox}
    H --> J
    J -->|Approve| K[Linked to selected job<br/>Timeline updated]
    J -->|Ignore| L[Marked as not relevant]
```

**What the AI looks for:**
- Content relevance - Is this about job applications?
- Job matching - Which of your tracked jobs is this about?
- Message type - Interview, offer, rejection, or update?

**Your control:**
- High-confidence matches (95%+) happen automatically
- Everything else appears in your Inbox for a quick yes/no decision
- You can always correct the job match when approving

**Privacy note:** Only job ID, company name, and title are sent to the AI for matching. Full email content stays local.

## Persistent data

`./data` is bind-mounted into the container. It stores:

- SQLite DB: `data/jobs.db` (contains your API keys and configuration)
- Generated PDFs: `data/pdfs/`
- Template resume selection: Stored internally after selection.

## Public demo deployment (`DEMO_MODE=true`)

For a public sandbox website, set `DEMO_MODE=true` on the container.

Behavior in demo mode:

- **Works (local demo DB):** browsing, filtering, job status updates, timeline edits.
- **Simulated (no external side effects):** pipeline run, job summarize/process/rescore/pdf/apply, onboarding validations.
- **Blocked:** settings writes, database clear, backup create/delete, status bulk deletes.
- **Auto-reset:** seeded demo data is reset every 6 hours.

## Updating

```bash
git pull
docker compose pull
docker compose up -d
```
