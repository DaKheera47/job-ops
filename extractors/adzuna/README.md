# Adzuna Extractor

Minimal extractor that pulls jobs from Adzuna's search API and writes a dataset
for orchestrator ingestion.

## Environment

- `ADZUNA_APP_ID` (required)
- `ADZUNA_APP_KEY` (required)
- `ADZUNA_COUNTRY` (default: `gb`)
- `ADZUNA_SEARCH_TERMS` (JSON array or `|` / comma / newline-delimited)
- `ADZUNA_LOCATION_QUERY` (optional city/location text passed to Adzuna `where`)
- `ADZUNA_MAX_JOBS_PER_TERM` (default: `50`)
- `ADZUNA_RESULTS_PER_PAGE` (default: `50`, max `50`)
- `ADZUNA_OUTPUT_JSON` (default: `storage/datasets/default/jobs.json`)
- `JOBOPS_EMIT_PROGRESS=1` to emit `JOBOPS_PROGRESS` events
