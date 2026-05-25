---
id: startup-jobs
title: startup.jobs Extractor
description: startup.jobs extraction integrated through the startup-jobs-scraper package.
sidebar_position: 8
---

## What it is

Original website: [startup.jobs](https://startup.jobs)

This extractor wraps the published [`startup-jobs-scraper`](https://www.npmjs.com/package/startup-jobs-scraper) package and feeds normalized startup.jobs listings into the existing pipeline.

Implementation split:

1. `extractors/startupjobs/src/run.ts` calls `scrapeStartupJobsViaAlgolia` and maps package records into `CreateJobInput`.
2. `extractors/startupjobs/src/manifest.ts` adapts pipeline settings, emits progress updates, and registers the source for runtime discovery.

## Why it exists

startup.jobs adds a startup-focused board to job-ops without introducing another bespoke scraper in this repository.

Using the published package also keeps the integration small and makes it easier to evolve the scraping logic independently from the app.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Leave **startup.jobs** enabled in **Sources** or toggle it on.
3. Set your usual automatic run controls:
   - `searchTerms` are sent as `query`.
   - country or city filters are reused as the package `location` option.
   - workplace type is passed through as the package `workplaceType` option.
   - run budget path (`jobspyResultsWanted`) is reused as `requestedCount` per term.
4. Start the run and monitor progress in the pipeline progress card.

Defaults and constraints:

- No new credentials are required.
- The integration runs with `enrichDetails: true`, so it opens job detail pages for richer records.
- Browser binaries are not downloaded automatically with the package. Install them with `npx playwright install` before using this extractor in a fresh environment.
- When **Search cities** is set, the extractor runs once per city and once per search term.
- Workplace type is a global run filter, not a per-city override.
- Without explicit cities, the selected country is used as the location filter except for broad modes such as `worldwide` and `usa/ca`.

## Common problems

### startup.jobs does not appear in sources

- Check that the app is running a build that includes the new extractor manifest.
- This source does not require credentials, so it should appear as soon as the updated build is loaded.

### Results are broader than expected

- If no city is configured, the extractor uses the selected country when possible and otherwise falls back to a broad search.
- Add **Search cities** when you want tighter geographic filtering.

### Job descriptions are missing

- Detail enrichment depends on Playwright browser binaries being installed locally.
- Run `npx playwright install` and retry if the extractor cannot open job detail pages.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
