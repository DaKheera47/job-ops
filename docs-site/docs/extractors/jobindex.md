---
id: jobindex
title: Jobindex Extractor
description: Denmark-only Jobindex extraction through the browser page Stash payload.
sidebar_position: 11
---

## What it is

Original website: [Jobindex](https://www.jobindex.dk/)

This extractor reads Jobindex search result pages and parses the embedded `var Stash = ...` payload that powers the browser result app. The first implementation supports Denmark query-only searches.

Implementation split:

1. `extractors/jobindex/src/run.ts` fetches `/jobsoegning?q=...`, parses `searchResponse.results`, paginates with `page=2`, and maps rows into `CreateJobInput`.
2. `extractors/jobindex/src/manifest.ts` enforces Denmark-only runs, adapts pipeline settings, emits progress updates, and registers the source for runtime discovery.

## Why it exists

Jobindex is a strong local source for Denmark roles, and the embedded Stash payload exposes structured result data without needing browser rendering.

Using the page payload keeps the scraper small while still capturing company, location, dates, rating, listing URL, and direct application links when they appear in the result HTML.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Select **Denmark** as the country.
3. Leave **Jobindex** enabled in **Sources** or toggle it on.
4. Enter search terms such as:
   ```text
   software engineer
   platform engineer
   backend developer
   ```
5. Start the run and monitor list-page progress in the pipeline progress card.

Defaults and constraints:

- The extractor only runs when selected country is `denmark`.
- Location-specific Jobindex paths and `geoareaid` filters are not implemented yet.
- `JOBINDEX_MAX_JOBS_PER_TERM` controls the default per-term cap when no automatic run budget override is present.
- Direct application links are parsed from the result card heading where available; otherwise the Jobindex listing URL is used.
- Job descriptions come from paragraph text in the result card, not from full detail-page scraping.

## Common problems

### Jobindex does not run

- Confirm the selected country is Denmark.
- Check that the app build includes `extractors/jobindex/src/manifest.ts` and the shared `jobindex` source metadata.

### Results are not filtered to a city

- City/location support is intentionally deferred for the first version.
- Use query terms to narrow results until Jobindex location filters are added.

### Application links point to Jobindex

- Some listings do not expose a direct external apply link in the result card.
- In those cases the extractor keeps the stable Jobindex listing URL so the job is still actionable.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
