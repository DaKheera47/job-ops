# Hiring Cafe Extractor

Browser-backed extractor for Hiring Cafe search APIs.

Special thanks: initial implementation inspiration came from [umur957/hiring-cafe-job-scraper](https://github.com/umur957/hiring-cafe-job-scraper).

## Environment

- `HIRING_CAFE_SEARCH_TERMS` (JSON array or `|` / comma / newline-delimited)
- `HIRING_CAFE_COUNTRY` (default: `united kingdom`)
- `HIRING_CAFE_MAX_JOBS_PER_TERM` (default: `200`)
- `HIRING_CAFE_DATE_FETCHED_PAST_N_DAYS` (default: `7`)
- `HIRING_CAFE_LOCATION_QUERY` (optional city, e.g. `Leeds`)
- `HIRING_CAFE_LOCATION_RADIUS_MILES` (default: `1` when city is set)
- `HIRING_CAFE_OUTPUT_JSON` (default: `storage/datasets/default/jobs.json`)
- `JOBOPS_EMIT_PROGRESS=1` to emit `JOBOPS_PROGRESS` events
- `HIRING_CAFE_HEADLESS=false` to run headed

## Notes

- The extractor uses `s = base64(url-encoded JSON search state)`.
- `worldwide` and `usa/ca` are treated as broad search modes without hard country location filters.
- City geocoding uses [Nominatim](https://nominatim.openstreetmap.org/) (OpenStreetMap data).
