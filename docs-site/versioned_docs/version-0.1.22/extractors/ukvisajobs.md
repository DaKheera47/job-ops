---
id: ukvisajobs
title: UKVisaJobs Extractor
description: Authenticated session flow, API pagination, and orchestrator ingestion.
sidebar_position: 5
---

UKVisaJobs is the most complex extractor because authenticated sessions are required.

## Big picture

Two layers:

1. `extractors/ukvisajobs/src/main.ts` handles login/API calls and dataset output.
2. `orchestrator/src/server/services/ukvisajobs.ts` executes extractor and ingests/de-dupes output.

## 1) Authentication and session cache

Session cache file:

- `extractors/ukvisajobs/storage/ukvisajobs-auth.json`

Flow:

- Reuse cached token/cookies when valid
- Re-login with Playwright + Camoufox when needed
- Refresh and retry on token-expired responses

Force refresh:

- `UKVISAJOBS_REFRESH_ONLY=1`

## 2) API requests

Endpoint:

- `https://my.ukvisajobs.com/ukvisa-api/api/fetch-jobs-data`

Each request includes auth token + session cookies and paginates (15 jobs/page).

## 3) Mapping

- Normalizes salary from min/max/interval
- Builds fallback visa description when content missing
- Maps `job_link` to both `jobUrl` and `applicationLink`

## 4) Output dataset

Written to:

- `extractors/ukvisajobs/storage/datasets/default/`

Includes per-job JSON files and combined `jobs.json`.

## 5) Orchestrator flow

- Spawns extractor (`npx tsx src/main.ts`)
- Runs terms sequentially with delay
- De-dupes by `sourceJobId` (fallback `jobUrl`)
- Fetches detail pages when descriptions are too short

## Controls

- `UKVISAJOBS_EMAIL`, `UKVISAJOBS_PASSWORD`
- `UKVISAJOBS_HEADLESS`
- `UKVISAJOBS_MAX_JOBS` (default 50, max 200)
- `UKVISAJOBS_SEARCH_KEYWORD`

## Practical notes

- Deleting auth cache forces next run to re-login.
- Low-concurrency/polite scraping by design.
- If extractor breaks, check session refresh path first.
