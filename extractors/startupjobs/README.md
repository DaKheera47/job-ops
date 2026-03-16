# startup.jobs Extractor

Extractor wrapper around the published `startup-jobs-scraper` package.

## Notes

- Uses `scrapeStartupJobsViaAlgolia` directly from `startup-jobs-scraper`.
- Runs with `enrichDetails: true` so job descriptions and other detail-page fields are fetched during pipeline runs.
- Browser binaries are not downloaded automatically. Install them with `npx playwright install` or `npm --workspace startupjobs-extractor run get-binaries`.
- Reuses the pipeline's existing search terms, country, city, and budget controls.
