---
id: hiring-cafe
title: Hiring Cafe Extractor
description: Browser-backed Hiring Cafe extraction integrated into the pipeline source selector.
sidebar_position: 7
---

## What it is

Original website: [hiring.cafe](https://hiring.cafe)

Special thanks: Initial implementation inspiration came from [umur957/hiring-cafe-job-scraper](https://github.com/umur957/hiring-cafe-job-scraper).

Hiring Cafe is a browser-backed extractor that queries Hiring Cafe search APIs and maps results into the orchestrator `CreateJobInput` shape.

Implementation split:

1. `extractors/hiringcafe/src/main.ts` builds search state, calls Hiring Cafe APIs, and writes dataset JSON.
2. `orchestrator/src/server/services/hiring-cafe.ts` runs the extractor, streams progress events, and maps rows for pipeline import.

## Why it exists

Hiring Cafe adds another non-credentialed source that can be enabled from the existing source picker, without adding new settings UI.

It also supports term-by-term search and country-aware search state using the same pipeline knobs you already set for automatic runs.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. **Hiring Cafe** is enabled by default in **Sources** (toggle it off if you do not want it for this run).
3. Set your existing automatic run knobs:
   - `searchTerms` drive per-term Hiring Cafe `searchQuery`.
   - selected country maps into Hiring Cafe location search state.
   - run budget path (`jobspyResultsWanted`) is reused as the max jobs-per-term cap.
4. Start the run and watch progress in the pipeline progress card.

Defaults and constraints:

- No new Hiring Cafe settings fields were added.
- `worldwide` and `usa/ca` run in broad mode without a strict country location filter.
- Hiring Cafe is enabled by default in source selection.
- `HIRING_CAFE_DATE_FETCHED_PAST_N_DAYS` controls recency window when running extractor directly (default `7`).

Local run example:

```bash
HIRING_CAFE_SEARCH_TERMS='["backend engineer"]' \
HIRING_CAFE_COUNTRY='united kingdom' \
HIRING_CAFE_MAX_JOBS_PER_TERM='50' \
npm --workspace hiringcafe-extractor run start
```

## Common problems

### Hiring Cafe returns 429 / Vercel security checkpoint

- The extractor first attempts Camoufox-backed Firefox and falls back to vanilla Firefox startup if Camoufox is unstable locally.
- If upstream blocks continue, retry later or reduce run concurrency at the pipeline level by selecting fewer sources.

### Hiring Cafe does not appear in sources

- Check that client is running on latest build containing the new source list.
- Hiring Cafe is source-only and does not require credentials, so it should appear once the new build is loaded.

### Results are lower than expected

- Cap is tied to automatic run budget path (`jobspyResultsWanted`) and search term count.
- Country mapping can narrow results when a strict country location is applied.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Settings](/docs/next/features/settings)
