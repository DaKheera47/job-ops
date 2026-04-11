# Golang Jobs Extractor

Extractor wrapper around Golang Jobs' public Supabase-backed job feed.

## Notes

- Uses the same public data source the site reads in the browser.
- Reuses the pipeline's existing search terms, country, city, workplace type, and run-budget controls.
- Filters locally after fetch because the upstream feed is already Go-specific but not scoped to job-ops search terms.
