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

1.  **Connect AI**: Add your OpenRouter API key (required for job scoring and summaries).
2.  **PDF Export**: Add your RxResume credentials (used to export PDFs from v4.rxresu.me).
3.  **Template Resume**: Select a base resume from your v4.rxresu.me account.

The app saves these to its persistent database, so you don't need to manage `.env` files for basic setup. All other settings (like search terms, job sources, and more) can also be configured directly in the UI.

## Persistent data

`./data` is bind-mounted into the container. It stores:
- SQLite DB: `data/jobs.db` (contains your API keys and configuration)
- Generated PDFs: `data/pdfs/`
- Template resume selection: Stored internally after selection.

## Updating

```bash
git pull
docker compose pull
docker compose up -d
```
