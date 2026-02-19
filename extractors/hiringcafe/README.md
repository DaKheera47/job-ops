# Hiring Cafe Extractor

Browser-backed extractor for Hiring Cafe search APIs.

## Environment

- `HIRING_CAFE_SEARCH_TERMS` (JSON array or `|` / comma / newline-delimited)
- `HIRING_CAFE_COUNTRY` (default: `united kingdom`)
- `HIRING_CAFE_MAX_JOBS_PER_TERM` (default: `200`)
- `HIRING_CAFE_OUTPUT_JSON` (default: `storage/datasets/default/jobs.json`)
- `JOBOPS_EMIT_PROGRESS=1` to emit `JOBOPS_PROGRESS` events
- `HIRING_CAFE_HEADLESS=false` to run headed

## Notes

- The extractor uses `s = base64(url-encoded JSON search state)`.
- `worldwide` and `usa/ca` are treated as broad search modes without hard country location filters.
