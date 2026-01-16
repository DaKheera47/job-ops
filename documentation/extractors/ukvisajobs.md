# UKVisaJobs Extractor (How It Works)

This is a plain-English walkthrough of the UK Visa Jobs extractor. It's the most complex one because the site requires an authenticated session before the API will return jobs.

## Big picture

There are two layers:

1) `extractors/ukvisajobs/src/main.ts` handles logging in, talking to the UKVisaJobs API, and writing a Crawlee-style dataset.
2) `orchestrator/src/server/services/ukvisajobs.ts` runs that extractor, reads the dataset, de-dupes results, and optionally enriches descriptions.

## 1) Authentication and session cache

The API requires a token + cookies. The extractor keeps these in a cache file:

- `extractors/ukvisajobs/storage/ukvisajobs-auth.json`

Flow:

- If there's a cached session, it uses it.
- If not, it launches a real browser (Playwright + Camoufox), logs in with `UKVISAJOBS_EMAIL` and `UKVISAJOBS_PASSWORD`, then captures the auth cookies + token.
- It stores those values in the cache file for reuse.

You can force a refresh with:

- `UKVISAJOBS_REFRESH_ONLY=1`

If the API responds with an "expired" token error, it will automatically re-login and retry.

## 2) API requests

Once authenticated, it posts to:

- `https://my.ukvisajobs.com/ukvisa-api/api/fetch-jobs-data`

Each request:

- Includes the auth token in a form field.
- Includes cookies in the header (`csrf_token`, `ci_session`, `authToken`).
- Filters by search keyword if provided.
- Uses pagination (15 jobs per page).

## 3) Job mapping

The extractor normalizes the raw API data into the project's job shape:

- Salary is built from min/max values and interval.
- Visa-related flags are turned into a short fallback description if the job has no real description.
- The `job_link` becomes both `jobUrl` and `applicationLink`.

## 4) Output dataset

The extractor writes the results to:

- `extractors/ukvisajobs/storage/datasets/default/`

It mirrors Crawlee's dataset format:

- One JSON file per job.
- A combined `jobs.json` containing all jobs.

## 5) Orchestrator flow (how the app uses it)

When the pipeline runs:

- The server spawns the extractor as a child process (`npx tsx src/main.ts`).
- It can run multiple search terms sequentially (with a short delay between them).
- It reads the dataset and de-dupes by `sourceJobId` (or `jobUrl` fallback).
- If a job's description is missing or too short, it makes a direct HTTP request to the job URL and extracts plain text.
  - This is effectively a curl-style fetch of the job page to fill in the JD for scoring and summarization.

## Controls and limits

Key environment variables:

- `UKVISAJOBS_EMAIL`, `UKVISAJOBS_PASSWORD` (required for auth refresh)
- `UKVISAJOBS_HEADLESS` (set `false` to show the browser)
- `UKVISAJOBS_MAX_JOBS` (default 50, max 200)
- `UKVISAJOBS_SEARCH_KEYWORD` (single keyword filter)

The UI also lets you set max jobs and search terms via the pipeline settings.

## Practical notes

- If you remove the auth cache file, the next run will re-login.
- The extractor is intentionally polite: it runs low concurrency and adds short delays.
- If the API or session changes on the UKVisaJobs side, the refresh logic is the first thing to check.
