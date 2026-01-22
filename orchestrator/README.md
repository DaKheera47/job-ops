# Job Ops Orchestrator

A unified orchestrator for the job application pipeline. Discovers jobs, scores them for suitability, generates tailored resumes, and provides a UI to manage applications.

## Architecture

```
orchestrator/
├── src/
│   ├── server/           # Express backend
│   │   ├── api/          # REST API routes
│   │   ├── db/           # SQLite + Drizzle ORM
│   │   ├── pipeline/     # Orchestration logic
│   │   ├── repositories/ # Data access layer
│   │   └── services/     # Integrations (crawler, AI, PDF)
│   ├── client/           # React frontend
│   │   ├── api/          # API client
│   │   ├── components/   # UI components
│   │   └── styles/       # CSS design system
│   └── shared/           # Shared types
├── data/                 # SQLite DB + generated PDFs (gitignored)
└── public/               # Static assets
```

## Setup

1. **Install dependencies:**
   ```bash
   cd orchestrator
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # The app is self-configuring. You can add keys via the UI Onboarding.
   ```

3. **Initialize database:**
   ```bash
   npm run db:migrate
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```

   This starts:
   - Backend API at `http://localhost:3001`
   - Frontend at `http://localhost:5173`

## API Endpoints

### Jobs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/jobs` | List all jobs (filter with `?status=ready,discovered`) |
| GET | `/api/jobs/:id` | Get single job |
| PATCH | `/api/jobs/:id` | Update job |
| POST | `/api/jobs/:id/process` | Generate resume for job |
| POST | `/api/jobs/:id/apply` | Mark as applied + sync to Notion |
| POST | `/api/jobs/:id/skip` | Mark as skipped |

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pipeline/status` | Get pipeline status |
| GET | `/api/pipeline/runs` | Get recent pipeline runs |
| POST | `/api/pipeline/run` | Trigger pipeline manually |
| POST | `/api/webhook/trigger` | Webhook for n8n (use `WEBHOOK_SECRET`) |

## Daily Flow

1. **17:00 - n8n triggers pipeline:**
   - Calls `POST /api/webhook/trigger`
   - Pipeline crawls Gradcracker
   - Scores jobs with AI
   - Generates tailored resumes for top 10

2. **You review in the UI:**
   - See jobs at `http://localhost:5173`
   - "Ready" tab shows jobs with generated PDFs
   - Click "View Job" to open application
   - Download PDF and apply manually
   - Click "Mark Applied" → syncs to Notion

## n8n Setup

Create a workflow with:

1. **Schedule Trigger** - Every day at 17:00
2. **HTTP Request:**
   - Method: POST
   - URL: `http://localhost:3001/api/webhook/trigger`
   - Headers: `Authorization: Bearer YOUR_WEBHOOK_SECRET`

## Development

```bash
# Run just the server
npm run dev:server

# Run just the client
npm run dev:client

# Run the pipeline manually
npm run pipeline:run

# Build for production
npm run build
npm start
```

## Tech Stack

- **Backend:** Express, TypeScript, Drizzle ORM, SQLite
- **Frontend:** React, Vite, CSS (custom design system)
- **AI:** OpenRouter API (GPT-4o-mini)
- **PDF Generation:** Wraps existing Python RXResume automation
- **Job Crawling:** Wraps existing TypeScript Crawlee crawler
