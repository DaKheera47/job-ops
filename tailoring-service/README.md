# Job-Ops Tailoring Service

This is the Python-based AI Tailoring Service for the Job-Ops pipeline. It uses LLMs (via Gemini) to intelligently compress, rewrite, and tailor a master JSON Resume to precisely match a given Job Description.

## Architecture

This service works in tandem with the Job-Ops Orchestrator:
1. **Orchestrator** sends a Job Description and the Master Resume to this service.
2. **Tailoring Service** shrinks the resume (`compact.py`) and passes it to the LLM.
3. **LLM** explicitly generates a targeted summary, re-weights work bullet points (favoring the last 3 roles), and selects the top 25 most relevant certificates.
4. **Tailoring Service** safely merges these generated snippets back into the strict `master-resume.json` schema.
5. **Orchestrator** receives the tailored JSON and renders it to a PDF using the local `resumed` CLI.

## Prerequisites

- Python 3.10+
- `pip` or `uv`
- A valid Gemini API Key

## Local Development Setup

1. Install dependencies (if you haven't already):
```bash
pip install -r requirements.txt
# or
pip install fastapi uvicorn pydantic google-genai
```

2. Set your environment variables (or place them in a `.env` file):
```bash
export GEMINI_API_KEY="your_api_key_here"
```

3. Run the development server with hot-reloading:
```bash
uvicorn src.main:app --reload --port 8000
```

The service will be available at `http://127.0.0.1:8000`.

## Docker & Containerization (Production)

Running `uvicorn` and `npm run dev` in separate terminals is standard for **local development**. However, for a production or fully automated setup, this service is designed to be containerized.

When running as a container (e.g., using `docker-compose`), the startup process is entirely automated:
1. The `.env` file is automatically passed into the containers.
2. The Python container boots up and runs `uvicorn src.main:app --host 0.0.0.0 --port 8000` (without the `--reload` flag).
3. The Node.js Orchestrator container boots up, connects to the Python container via an internal Docker network (e.g., `http://tailoring-service:8000`), and serves the UI.

No manual terminal commands are needed once containerized.

## Troubleshooting
- **Caching Issues:** If you notice the AI is not updating results during testing, ensure the local SQLite cache in `src/cache.py` is disabled or cleared.
- **Missing Certificates:** Ensure your master resume uses the official JSON Resume key `"certificates"` (not `"certifications"`).
