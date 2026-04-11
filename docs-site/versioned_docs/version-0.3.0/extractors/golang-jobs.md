---
id: golang-jobs
title: Golang Jobs Extractor
description: Golang Jobs extraction integrated through the site's public Supabase-backed feed.
sidebar_position: 10
---

## What it is

Original website: [Golang Jobs](https://www.golangjobs.tech/)

This extractor reads the public Golang Jobs feed exposed through the site's browser-facing Supabase API and maps those rows into the existing job-ops schema.

Implementation split:

1. `extractors/golangjobs/src/run.ts` paginates the public feed, applies local term, country, city, and workplace filters, and maps returned rows into `CreateJobInput`.
2. `extractors/golangjobs/src/manifest.ts` adapts pipeline settings, emits progress updates, and registers the source for runtime discovery.

## Why it exists

Golang Jobs adds a Go-focused niche board that broad aggregators often miss.

Using the same public feed the site already serves in the browser keeps the integration lighter and more stable than scraping rendered React pages.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Leave **Golang Jobs** enabled in **Sources** or toggle it on.
3. Set your usual automatic run controls:
   - `searchTerms` are matched locally against title, company, description, requirements, and location.
   - selected country or explicit city filters are applied after feed download.
   - workplace type is respected from the location shape returned by the feed.
   - run budget path (`jobspyResultsWanted`) is reused as a per-term cap.
4. Start the run and monitor progress in the pipeline progress card.

Defaults and constraints:

- The extractor includes a built-in browser-facing anon key for the upstream public feed.
- You can override that default with `GOLANG_JOBS_SUPABASE_ANON_KEY` if the upstream rotates the key.
- The upstream feed is already Go-specific, but it is still broader than most job-ops searches, so local filtering remains important.
- The extractor currently relies on the public `jobs` and `cities` relationship exposed by the site; if the site changes that schema, the extractor will need updating.
- Remote roles are inferred from `cities.name === "Remote"`.

## Common problems

### Golang Jobs does not appear in sources

- Check that the app is running a build that includes the new extractor manifest and shared source metadata.

### Golang Jobs health checks or runs fail immediately

- If the upstream rotates its public browser key, set `GOLANG_JOBS_SUPABASE_ANON_KEY` in the server/container environment to override the built-in default.
- Rebuild the container after adding new environment variables if you run job-ops through Docker.

### Results are broader than expected

- The source is niche but still broad within the Go ecosystem.
- Add more specific search terms or explicit cities when you want a narrower result set.

### Onsite-only runs return no Golang Jobs jobs

- Many rows on this board are remote and are marked as such from the linked city record.
- Include `remote` in workplace type selection if you want this source to contribute jobs.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
