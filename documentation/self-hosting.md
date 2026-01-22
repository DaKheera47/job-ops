# Self-Hosting (Docker Compose)

The easiest way to run JobOps is via Docker Compose. The app is self-configuring and will guide you through the setup on your first visit.

## Prereqs

- Docker Desktop or Docker Engine + Compose v2

## 1) Start the stack

No environment variables are strictly required to start. Simply run:

```bash
docker compose up -d --build
```

This builds a single container that runs the API, UI, scrapers, and resume generator.

## 2) Access the app and Onboard

Open your browser to:
- **Dashboard**: http://localhost:3005

On first launch, you will be greeted by an **Onboarding Wizard**. The app will help you validate and save your configuration:

1.  **Connect AI**: Add your OpenRouter API key (required for job scoring and summaries).
2.  **PDF Export**: Add your RxResume credentials (if you want to generate tailored PDFs).
3.  **Resume JSON**: Upload your base resume JSON (exported from RxResume).

The app saves these to its persistent database, so you don't need to manage `.env` files for basic setup. All other settings (like search terms, job sources, and more) can also be configured directly in the UI.

## Persistent data

`./data` is bind-mounted into the container. It stores:
- SQLite DB: `data/jobs.db` (contains your API keys and configuration)
- Generated PDFs: `data/pdfs/`
- Resume JSON: Stored internally after upload.

## Updating

```bash
git pull
docker compose up -d --build
```
