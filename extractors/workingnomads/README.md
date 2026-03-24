# Working Nomads Extractor

Extractor wrapper around the public [Working Nomads exposed jobs API](https://www.workingnomads.com/api/exposed_jobs/).

## Notes

- Uses the public JSON API instead of scraping rendered HTML.
- Reuses the pipeline's existing search terms, country, city, and workplace type controls.
- Working Nomads is a remote-only source, so hybrid and onsite-only runs are filtered out.
