---
id: working-nomads
title: Working Nomads Extractor
description: Public API-backed Working Nomads extraction integrated into pipeline source selection.
sidebar_position: 9
---

## What it is

Original website: [Working Nomads](https://www.workingnomads.com/)

This extractor uses the public [Working Nomads exposed jobs API](https://www.workingnomads.com/api/exposed_jobs/) rather than scraping rendered HTML pages.

Implementation split:

1. `extractors/workingnomads/src/run.ts` fetches the public JSON feed, filters it against job-ops search controls, and maps rows into `CreateJobInput`.
2. `extractors/workingnomads/src/manifest.ts` adapts pipeline settings, emits progress updates, and registers the source for runtime discovery.

## Why it exists

Working Nomads adds another remote-focused source without introducing credentials, browser automation, or brittle page scraping.

Using the public API keeps the integration small and more stable than scraping category pages, while still feeding normalized jobs into the existing discovery pipeline.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Leave **Working Nomads** enabled in **Sources** or toggle it on.
3. Set your usual automatic run controls:
   - `searchTerms` are matched locally against title, employer, category, tags, location, and description.
   - selected country or city filters are applied after the API fetch.
   - workplace type is respected globally for the run.
   - run budget path (`jobspyResultsWanted`) is reused as a per-term cap.
4. Start the run and monitor progress in the pipeline progress card.

Defaults and constraints:

- No new credentials are required.
- Working Nomads is a remote-only source, so it does not return meaningful hybrid-only or onsite-only results.
- The public API currently returns a single JSON feed, so filtering is performed client-side inside the extractor.
- Job type is inferred from title and description when the API does not provide an explicit full-time, part-time, or contract field.

## Common problems

### Working Nomads does not appear in sources

- Check that the app is running a build that includes the new extractor manifest and shared source metadata.
- This source does not require credentials, so it should appear as soon as the updated build is loaded.

### Results are broader than expected

- The upstream API is a broad remote jobs feed, so job-ops filters it after download.
- Add more specific search terms or city filters when you want a narrower result set.

### Hybrid or onsite runs return no Working Nomads jobs

- Working Nomads is integrated as a remote-only board.
- Include `remote` in workplace type selection if you want this source to contribute jobs.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
