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

   After the server starts, use the onboarding modal to connect OpenRouter, link your v4.rxresu.me account, and select a template resume.

   OpenRouter is the default LLM provider, but LM Studio, Ollama, OpenAI, and Gemini are also supported.

   Use `LLM_API_KEY` / `llmApiKey` to configure providers that require an API key.

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
| POST | `/api/jobs/:id/apply` | Mark as applied |
| POST | `/api/jobs/:id/skip` | Mark as skipped |

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pipeline/status` | Get pipeline status |
| GET | `/api/pipeline/runs` | Get recent pipeline runs |
| POST | `/api/pipeline/run` | Trigger pipeline manually |
| POST | `/api/webhook/trigger` | Webhook for n8n (use `WEBHOOK_SECRET`) |

### Post-Application Tracking

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/post-application/inbox` | List pending messages for review |
| POST | `/api/post-application/inbox/:id/approve` | Approve and link to job |
| POST | `/api/post-application/inbox/:id/deny` | Ignore message |
| GET | `/api/post-application/runs` | List sync run history |
| POST | `/api/post-application/gmail/connect` | Initiate Gmail OAuth flow |
| GET | `/api/post-application/gmail/callback` | Gmail OAuth callback |

## Daily Flow

1. **17:00 - n8n triggers pipeline:**
   - Calls `POST /api/webhook/trigger`
   - Pipeline crawls Gradcracker
   - Scores jobs with AI
   - Generates tailored resumes for top 10

2. **You review in the UI:**
   - See jobs at `http://localhost:5173`
   - "Ready" tab shows jobs with generated PDFs
   - Use command bar search (`Cmd/Ctrl+K`) to quickly find and open jobs
   - Click "View Job" to open application
   - Download PDF and apply manually
   - Click "Mark Applied" to mark application status

3. **Track responses (optional):**
   - Connect Gmail in Tracking Inbox settings
   - Automatic email monitoring for interview invites, offers, rejections
   - Review and approve/ignore matched emails in the Inbox

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
- **AI:** Configurable LLM provider (OpenRouter default; also supports OpenAI/Gemini/LM Studio/Ollama)
- **PDF Generation:** RxResume v4 API export (configured via Settings)
- **Job Crawling:** Wraps existing TypeScript Crawlee crawler
