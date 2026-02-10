# JobSpy Extractor (How It Works)

This is a simple walkthrough of the JobSpy extractor used for Indeed, LinkedIn, and Glassdoor.

## Big picture

JobSpy is a Python library. We wrap it in a tiny Python script, run it once per search term, then ingest the JSON it writes into our database format.

## 1) Inputs and defaults

The Python wrapper (`extractors/jobspy/scrape_jobs.py`) reads environment variables and falls back to sensible defaults:

- `JOBSPY_SITES` (default: `indeed,linkedin`)
- `JOBSPY_SEARCH_TERM` (default: `web developer`)
- `JOBSPY_LOCATION` (default: `UK`)
- `JOBSPY_RESULTS_WANTED` (default: `200`)
- `JOBSPY_HOURS_OLD` (default: `72`)
- `JOBSPY_COUNTRY_INDEED` (default: `UK`)
- `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` (default: `true`)

It writes output to both CSV and JSON files. The JSON is what we ingest.

## 2) Orchestrator flow

The Node service (`orchestrator/src/server/services/jobspy.ts`) controls the run:

- Builds a list of search terms (from the UI, or `JOBSPY_SEARCH_TERMS` env).
- Runs the Python script once per search term with a unique output filename.
- Reads the JSON file, maps each row to our internal `CreateJobInput` shape.
- De-dupes by `jobUrl` so the same listing only appears once.
- Deletes the CSV/JSON files after ingesting (best effort).

## 3) Mapping and cleanup

The mapper normalizes fields like salary ranges, converts empty values to null, and keeps extra metadata (skills, company rating, remote flag, etc.) when available.

If a row is missing a valid site (`indeed`, `linkedin`, or `glassdoor`) or a job URL, it gets skipped.

## Notes

- If `JOBSPY_SEARCH_TERMS` is a JSON array, it will be parsed as-is. Otherwise it can be a `|`, comma, or newline-separated list.
- LinkedIn descriptions are optional and can slow the crawl; set `JOBSPY_LINKEDIN_FETCH_DESCRIPTION=0` to disable.
- Output files are stored under `data/imports/` before being cleaned up.
