---
id: overview
title: Extractors Overview
description: Technical index of supported extractors and how they work.
sidebar_position: 1
---

This page helps you choose the right extractor for your run, understand key constraints, and navigate to detailed technical guides.

Extractor integrations are now registered through manifests and loaded automatically at orchestrator startup. Runtime discovery only scans `extractors/*/(manifest.ts|src/manifest.ts)` and does not read manifests from `orchestrator/**`. Extractor-specific run logic should also remain in `extractors/<name>/` so orchestrator stays source-agnostic. To add a new source, follow [Add an Extractor](/docs/next/workflows/add-an-extractor).

## Extractor chooser

| Extractor | Best use case | Core constraints/dependencies | Notable controls | Output/behavior notes |
| --- | --- | --- | --- | --- |
| [Gradcracker](/docs/next/extractors/gradcracker) | UK graduate roles from Gradcracker | Crawling stability depends on page structure and anti-bot behavior; tuned for low concurrency | `GRADCRACKER_SEARCH_TERMS`, `GRADCRACKER_MAX_JOBS_PER_TERM`, `JOBOPS_SKIP_APPLY_FOR_EXISTING` | Scrapes listing metadata, then detail pages and apply URL resolution |
| [JobSpy](/docs/next/extractors/jobspy) | Multi-source discovery (Indeed, LinkedIn, Glassdoor) | Requires Python wrapper execution per term; source availability and quality vary by site/location | `JOBSPY_SITES`, `JOBSPY_SEARCH_TERMS`, `JOBSPY_RESULTS_WANTED`, `JOBSPY_HOURS_OLD`, `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` | Produces JSON per term, then orchestrator normalizes and de-duplicates by `jobUrl` |
| [Adzuna](/docs/next/extractors/adzuna) | API-based multi-country discovery with low scraping overhead | Requires valid App ID/App Key; country must be in Adzuna-supported list | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_MAX_JOBS_PER_TERM` | API pagination to dataset output; orchestrator maps progress and de-duplicates by `sourceJobId`/`jobUrl` |
| [Hiring Cafe](/docs/next/extractors/hiring-cafe) | Browser-backed discovery using Hiring Cafe search APIs | Subject to upstream anti-bot checks; uses browser context and encoded search-state payloads | `HIRING_CAFE_SEARCH_TERMS`, `HIRING_CAFE_COUNTRY`, `HIRING_CAFE_MAX_JOBS_PER_TERM`, `HIRING_CAFE_DATE_FETCHED_PAST_N_DAYS` | Uses existing pipeline term/country/budget knobs and maps directly to normalized jobs |
| [startup.jobs](/docs/next/extractors/startup-jobs) | Startup-focused discovery through the published `startup-jobs-scraper` package | No credentials required; detail enrichment depends on Playwright browser binaries being installed | existing pipeline `searchTerms`, selected country/cities, `jobspyResultsWanted`; `npx playwright install` for fresh environments | Algolia-backed search plus detail-page enrichment via package import; orchestrator maps normalized records and de-duplicates by `jobUrl` |
| [Working Nomads](/docs/next/extractors/working-nomads) | Remote-only discovery through the public Working Nomads jobs API | Public API is curated and remote-only; available fields are limited to API payload shape | existing pipeline `searchTerms`, selected country/cities, `jobspyResultsWanted`, workplace type | Fetches a single public JSON feed, filters locally by terms/location, infers job type when possible, and de-duplicates by source id / URL |
| [UKVisaJobs](/docs/next/extractors/ukvisajobs) | UK visa sponsorship-focused roles | Requires authenticated session and periodic token/cookie refresh | `UKVISAJOBS_EMAIL`, `UKVISAJOBS_PASSWORD`, `UKVISAJOBS_MAX_JOBS`, `UKVISAJOBS_SEARCH_KEYWORD` | API pagination + dataset output; orchestrator de-dupes and may fetch missing descriptions |
| [Manual Import](/docs/next/extractors/manual) | One-off jobs not covered by scrapers | Inference quality depends on model/provider and input quality; some URLs cannot be fetched reliably | App/API endpoints (`/api/manual-jobs/infer`, `/api/manual-jobs/import`) | Accepts text/HTML/URL, runs inference, then saves and scores job after review |

## Which extractor should I use?

- Use **JobSpy** for broad first-pass sourcing across common boards.
- Use **Adzuna** when you want API-first discovery in supported non-UK markets.
- Use **Hiring Cafe** when you want another term/country-driven source without adding credentials.
- Use **startup.jobs** when you want startup-heavy listings without maintaining another scraper locally.
- Use **Working Nomads** when you want another remote-only source with a public API and curated global roles.
- Use **Gradcracker** when targeting graduate pipelines in the UK.
- Use **UKVisaJobs** for sponsorship-specific UK searches.
- Use **Manual Import** when you already have a specific posting and need direct import.

Many runs combine sources: broad discovery first, then manual import for high-priority jobs that scraping misses.

## Common problems

### How do I health-check an extractor?

- Every runtime-registered extractor source exposes `GET /api/:source/health`.
- Use the source id from the shared extractor catalog, for example `/api/linkedin/health` or `/api/gradcracker/health`.
- The health check runs a minimal live probe for that source with a fixed search term and a result limit of `1`.
- A `200` response means the extractor returned at least one valid normalized job for that source.
- A `503` response means the extractor could not run successfully, returned no jobs, or returned invalid jobs.
- A `404` response means the source id is unknown or not registered at runtime on that instance.

## Related extractor docs

- [Gradcracker](/docs/next/extractors/gradcracker)
- [JobSpy](/docs/next/extractors/jobspy)
- [Adzuna](/docs/next/extractors/adzuna)
- [Hiring Cafe](/docs/next/extractors/hiring-cafe)
- [startup.jobs](/docs/next/extractors/startup-jobs)
- [Working Nomads](/docs/next/extractors/working-nomads)
- [UKVisaJobs](/docs/next/extractors/ukvisajobs)
- [Manual Import](/docs/next/extractors/manual)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
