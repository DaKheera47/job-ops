# Manual Import Extractor (How It Works)

This is a walkthrough of the manual job import flow, which allows users to add jobs that aren't captured by automated scrapers.

## Big Picture

Instead of scraping a website, the manual extractor takes a raw job description (pasted text), parses the details (using AI), and allows the user to review and edit the data before importing it into the pipeline.

## 1) Input

The user provides input via the **Manual Import** sheet in the UI. They paste a full job description, copied from any source (job board, company site, email, etc.).

## 2) AI Inference

When the user clicks "Analyze JD", the orchestrator calls an internal endpoint (`/api/manual-jobs/infer`).

The server-side service (`orchestrator/src/server/services/manualJob.ts`) then:
- Sends the raw text to an LLM (via the configured provider; OpenRouter by default).
- Uses a specific prompt to extract structured data (title, employer, location, salary, etc.).
- Returns a JSON object containing the inferred fields.

If the LLM API key is not configured (e.g. `LLM_API_KEY` for OpenRouter/OpenAI/Gemini), the inference step skips and warns the user to fill details manually.

(`OPENROUTER_API_KEY` is deprecated and is automatically copied to `LLM_API_KEY` for compatibility.)

## 3) Review and Edit

The inferred data is populated into a form in the UI. The user can:
- Correct any mistakes made by the AI.
- Add missing information.

## 4) Storage and Scoring

Once the user clicks "Import Job", the data is sent to `/api/manual-jobs/import`.

The orchestrator:
- Generates a unique ID for the job if no URL is provided.
- Saves the job to the database with the source set to `manual`.
- **Asynchronously triggers scoring**: The job is immediately run through the suitability scorer (`orchestrator/src/server/services/scorer.ts`) against the user's current resume profile.
- Updates the job record with the suitability score and reason once complete.
