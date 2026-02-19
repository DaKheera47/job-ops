---
id: adzuna
title: Adzuna Extractor
description: API-based Adzuna extraction with orchestrator ingestion and progress updates.
sidebar_position: 6
---

## What it is

Original website: [adzuna.com](https://www.adzuna.com)

Adzuna is an API-backed extractor implemented in two lean pieces:

1. `extractors/adzuna/src/main.ts` fetches paginated Adzuna search results and writes `jobs.json`.
2. `orchestrator/src/server/services/adzuna.ts` runs the extractor, parses progress lines, and maps rows into `CreateJobInput`.

It de-duplicates in the existing repository path using `sourceJobId` fallback to `jobUrl`.

## Why it exists

Adzuna provides stable API discovery for countries that are not covered by UK-only sources. It adds a lower-maintenance source without introducing new API routes or UI sections.

## How to use it

1. Create an Adzuna developer account.
2. Open [Adzuna Access Details](https://developer.adzuna.com/admin/access_details).
3. Copy your **App ID** and **App Key**.
4. In Job Ops, open **Settings** and paste them into `Adzuna App ID` and `Adzuna App Key` under **Environment & Accounts**.
5. In **Pipeline Run** (Automatic tab), select a compatible country and enable **Adzuna** in Sources.
6. Start the run; Adzuna progress appears in the existing crawl progress stream.

Default controls:

- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`
- `ADZUNA_MAX_JOBS_PER_TERM` (default `50`)

Supported countries in this integration:

- United Kingdom, United States, Austria, Australia, Belgium, Brazil, Canada, Switzerland, Germany, Spain, France, India, Italy, Mexico, Netherlands, New Zealand, Poland, Singapore, South Africa.

## Common problems

### Adzuna is disabled in source selection

- `Adzuna App ID` and `Adzuna App Key` are missing from Settings (or env).

### Adzuna is skipped for my selected country

- The selected country is not in the supported list above.

### Adzuna fails with authorization errors

- Verify `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are valid and active in your Adzuna account.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Settings](/docs/next/features/settings)
