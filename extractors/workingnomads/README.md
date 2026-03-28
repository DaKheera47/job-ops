# Working Nomads Extractor

Extractor wrapper around Working Nomads' JSON search API at `https://www.workingnomads.com/jobsapi/_search`.

## Notes

- Uses the public JSON API instead of scraping rendered HTML.
- Reuses the pipeline's existing search terms, country, city, and workplace type controls.
- Working Nomads is a remote-only source, so hybrid and onsite-only runs are filtered out.
